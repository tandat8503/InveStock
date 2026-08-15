import { appCommands } from '@/lib/commands'
import { localDateISO } from '@/utils/localDate'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal, Button, Input, Select, CurrencyInput, DatePicker, ProductSearchCombobox, UnsavedChangesDialog } from '@/components/ui'
import { createPurchaseInvoiceSchema, type CreatePurchaseInvoiceInput } from '@shared/schemas'
import type { ProductDTO, PurchaseInvoiceDTO, SupplierDTO } from '@shared/ipc-types'
import { useNotify } from '@/stores/uiStore'


export function PurchaseForm({ invoice, open, onClose, onSuccess }: { invoice?: PurchaseInvoiceDTO; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const notify = useNotify()
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState<number | ''>('')
  const [lineTotal, setLineTotal] = useState<number | ''>('')
  const [preview, setPreview] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [preferredSupplierIds, setPreferredSupplierIds] = useState<number[]>([])

  const { control, register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting, isDirty } } = useForm<CreatePurchaseInvoiceInput>({
    resolver: zodResolver(createPurchaseInvoiceSchema),
    defaultValues: {
      invoiceNumber: '',
      invoiceDate: localDateISO(),
      receivedDate: localDateISO(),
      supplierId: 0,
      notes: '',
      items: [],
    },
  })

  useEffect(() => {
    if (!open) return
    reset(invoice ? {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      receivedDate: invoice.receivedDate,
      supplierId: invoice.supplierId,
      notes: invoice.notes ?? '',
      items: invoice.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        lineTotal: item.lineTotal ?? (item.quantity * item.invoiceUnitPrice),
      })),
    } : {
      invoiceNumber: '',
      invoiceDate: localDateISO(),
      receivedDate: localDateISO(),
      supplierId: 0,
      notes: '',
      items: [],
    })
    setPreview(false)
    setSaveError('')
    setProductId('')
    setQuantity('')
    setLineTotal('')

    void Promise.all([
      appCommands.suppliers.list({ activeOnly: true }),
      appCommands.products.list({ activeOnly: true, page: 1, pageSize: 500 }),
      appCommands.settings.get(),
    ]).then(([supplierResult, productResult, settingsResult]) => {
      const preferred = settingsResult.data?.preferredSupplierIds ?? []
      setPreferredSupplierIds(preferred)
      if (supplierResult.data) {
        const ordered = [...supplierResult.data.items].sort((left, right) => {
          const leftIndex = preferred.indexOf(left.id)
          const rightIndex = preferred.indexOf(right.id)
          return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex)
        })
        setSuppliers(ordered)
        if (!invoice && ordered.length > 0 && preferred.includes(ordered[0].id)) {
          setValue('supplierId', ordered[0].id, { shouldValidate: true })
        }
      }
      if (productResult.data) setProducts(productResult.data.items)
    })
  }, [invoice, open, reset, setValue])

  const items = watch('items')

  const submit = async (data: CreatePurchaseInvoiceInput) => {
    if (!preview) { setPreview(true); return }
    setSaveError('')
    const parsed = createPurchaseInvoiceSchema.parse(data)
    const result = invoice
      ? await appCommands.purchases.updateDraft(invoice.id, parsed)
      : await appCommands.purchases.create(parsed)
    if (result.success) {
      notify.success(invoice ? 'Cập nhật phiếu nhập nháp thành công' : 'Tạo phiếu nhập nháp thành công')
      setPreview(false)
      onSuccess()
    }
    else setSaveError(result.error ?? 'Không thể lưu phiếu nhập. Dữ liệu đã nhập vẫn được giữ để bạn sửa và thử lại.')
  }

  const addItem = () => {
    const id = Number(productId)
    if (!id) {
      notify.error('Vui lòng chọn một sản phẩm')
      return
    }
    const q = typeof quantity === 'number' ? quantity : 0
    if (q <= 0) {
      notify.error('Số lượng sản phẩm nhập phải lớn hơn 0')
      return
    }
    const val = typeof lineTotal === 'number' ? lineTotal : 0
    if (val <= 0) {
      notify.error('Tổng giá trị nhập phải lớn hơn 0')
      return
    }
    if (items.some((item) => item.productId === id)) {
      notify.error('Sản phẩm này đã có trong danh sách')
      return
    }
    setValue('items', [...items, { productId: id, quantity: q, lineTotal: val }], { shouldValidate: true })
    setProductId('')
    setQuantity('')
    setLineTotal('')
  }

  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const handleCloseAttempt = () => {
    if (isDirty) {
      setShowUnsavedConfirm(true)
    } else {
      onClose()
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={handleCloseAttempt}
      title={preview ? 'Xem trước phiếu nhập' : invoice ? 'Sửa phiếu nhập nháp' : 'Tạo phiếu nhập'}
      size="xl"
      footer={
        <>
          <Button onClick={() => { void handleSubmit(submit)() }} isLoading={isSubmitting}>
            {preview ? 'Lưu nháp' : 'Xem trước'}
          </Button>
          <Button variant="secondary" onClick={() => (preview ? setPreview(false) : handleCloseAttempt())}>
            Quay lại
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {saveError && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{saveError}</div>}
        {/* Hàng 1: 3 cột (Số hóa đơn | Ngày hóa đơn | Ngày nhập) */}
        <div className="grid gap-3 md:grid-cols-3">
          <Input label="Số hóa đơn" required {...register('invoiceNumber')} error={errors.invoiceNumber?.message} />

          <Controller
            name="invoiceDate"
            control={control}
            render={({ field }) => (
              <DatePicker
                label="Ngày hóa đơn"
                required
                value={field.value}
                onChange={field.onChange}
                error={errors.invoiceDate?.message}
              />
            )}
          />

          <Controller
            name="receivedDate"
            control={control}
            render={({ field }) => (
              <DatePicker
                label="Ngày nhập"
                required
                value={field.value}
                onChange={field.onChange}
                error={errors.receivedDate?.message}
              />
            )}
          />
        </div>

        {/* Hàng 2: Nhà cung cấp (50%) và Ghi chú (50%) */}
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <Select
              label="Nhà cung cấp"
              required
              {...register('supplierId', { valueAsNumber: true })}
              error={errors.supplierId?.message}
              options={[
                { value: '', label: 'Chọn nhà cung cấp' },
                ...suppliers.map((supplier) => ({ value: String(supplier.id), label: supplier.companyName })),
              ]}
            />
            {preferredSupplierIds.length > 0 && !preview && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="text-xs text-gray-500">Chọn nhanh:</span>
                {suppliers.filter((supplier) => preferredSupplierIds.includes(supplier.id)).map((supplier) => (
                  <button
                    key={supplier.id}
                    type="button"
                    className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                    onClick={() => setValue('supplierId', supplier.id, { shouldValidate: true })}
                  >
                    {supplier.companyName}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="md:col-span-6">
            <Input
              label="Ghi chú"
              placeholder="Nhập ghi chú phiếu nhập (nếu có)..."
              {...register('notes')}
              error={errors.notes?.message}
            />
          </div>
        </div>

        {/* Form thêm sản phẩm */}
        {!preview && (
          <div className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3 md:grid-cols-12 items-end">
            <div className="md:col-span-5">
              <ProductSearchCombobox
                label="Chọn sản phẩm"
                onSelect={(product) => setProductId(String(product.id))}
              />
              {productId && (() => {
                const selectedProd = products.find(p => String(p.id) === productId)
                if (selectedProd) {
                  return (
                    <p className="mt-1 text-xs text-gray-500 font-medium">
                      Đã chọn: <span className="text-primary-700">{selectedProd.productCode} — {selectedProd.productName}</span>
                    </p>
                  )
                }
                return null
              })()}
            </div>
            <div className="md:col-span-3">
              <Input
                label="Số lượng"
                type="number"
                min={1}
                placeholder="Nhập số lượng"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value === '' ? '' : Number(event.target.value))}
              />
            </div>
            <div className="md:col-span-3">
              <CurrencyInput
                label="Tổng giá trị nhập"
                value={lineTotal === '' ? 0 : lineTotal}
                onChange={(val) => setLineTotal(val || '')}
              />
            </div>
            <div className="md:col-span-1">
              <Button type="button" onClick={addItem} className="w-full">
                Thêm
              </Button>
            </div>
          </div>
        )}

        {/* Danh sách dòng sản phẩm */}
        <div className="space-y-2">
          {items.map((item, index) => {
            const product = products.find((entry) => entry.id === item.productId)
            const unit = product?.inventoryUnit ?? 'đơn vị'
            const effectiveUnitCost = Math.round(item.lineTotal / item.quantity)
            return (
              <div key={item.productId} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm border border-gray-200">
                <span>
                  <strong>{product?.productName ?? item.productId}</strong> ({product?.productCode}) — {item.quantity} {unit} — Tổng giá trị: <strong>{item.lineTotal.toLocaleString('vi-VN')} ₫</strong> ≈ {effectiveUnitCost.toLocaleString('vi-VN')} ₫/{unit}
                </span>
                {!preview && (
                  <button
                    className="text-red-600 hover:text-red-800 text-xs font-medium"
                    onClick={() => setValue('items', items.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Xóa
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {errors.items?.message && <p className="text-sm text-red-600">{errors.items.message}</p>}

        {/* Tóm tắt tổng tiền khi xem trước */}
        {preview && (() => {
          const grand = items.reduce((sum, item) => sum + item.lineTotal, 0)
          return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm space-y-1.5 mt-2">
              <p className="font-semibold text-gray-700 mb-2">Tóm tắt phiếu nhập</p>
              <div className="flex justify-between font-bold text-base border-t pt-2 text-gray-900">
                <span>Tổng giá trị phiếu nhập:</span>
                <span>{grand.toLocaleString('vi-VN')} ₫</span>
              </div>
            </div>
          )
        })()}
      </div>

      <UnsavedChangesDialog
        isOpen={showUnsavedConfirm}
        mode="draft"
        onSave={() => { setShowUnsavedConfirm(false); void handleSubmit(submit)() }}
        onDiscard={() => { setShowUnsavedConfirm(false); onClose() }}
        onContinue={() => setShowUnsavedConfirm(false)}
      />
    </Modal>
  )
}

