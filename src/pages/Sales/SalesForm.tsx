import { appCommands } from '@/lib/commands'
import { localDateISO } from '@/utils/localDate'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, CurrencyInput, DatePicker, ProductSearchCombobox, Input, Modal, Select, UnsavedChangesDialog } from '@/components/ui'
import { createSalesInvoiceSchema, type CreateSalesInvoiceInput } from '@shared/schemas'
import type { ProductDTO, SalesInvoiceDTO } from '@shared/ipc-types'
import { useNotify } from '@/stores/uiStore'


export function SalesForm({ sale, open, onClose, onSuccess }: { sale?: SalesInvoiceDTO; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const notify = useNotify()
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [selected, setSelected] = useState('')
  const [quantity, setQuantity] = useState<number | ''>('')
  const [lineTotalSale, setLineTotalSale] = useState<number | ''>('')
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)

  const { control, register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting, isDirty } } = useForm<CreateSalesInvoiceInput>({
    resolver: zodResolver(createSalesInvoiceSchema),
    defaultValues: { electronicInvoiceNumber: '', invoiceDate: localDateISO(), buyerType: 'khach_le', buyerName: '', notes: '', items: [] },
  })

  useEffect(() => {
    if (!open) return
    void appCommands.products.list({ activeOnly: true, page: 1, pageSize: 500 }).then((r) => { if (r.data) setProducts(r.data.items) })
    reset(sale ? {
      electronicInvoiceNumber: sale.electronicInvoiceNumber ?? '', invoiceDate: sale.invoiceDate,
      buyerType: sale.buyerType, buyerName: sale.buyerName ?? '', notes: sale.notes ?? '',
      items: sale.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        lineTotalSale: item.lineRevenue ?? (item.quantity * item.unitSalePrice),
      })),
    } : { electronicInvoiceNumber: '', invoiceDate: localDateISO(), buyerType: 'khach_le', buyerName: '', notes: '', items: [] })
    setPreview(false)
    setError('')
    setSelected('')
    setQuantity('')
    setLineTotalSale('')
  }, [open, reset, sale])

  const items = watch('items')

  const submit = async (data: CreateSalesInvoiceInput) => {
    setError('')
    const exceedsStock = data.items.some(item => {
      const p = products.find(prod => prod.id === item.productId)
      return p ? item.quantity > p.currentStock : false
    })
    if (exceedsStock) {
      setError("Số lượng xuất vượt quá tồn kho khả dụng của sản phẩm.")
      return
    }
    if (!preview) { setPreview(true); return }
    const parsed = createSalesInvoiceSchema.parse(data)
    const result = sale
      ? await appCommands.sales.updateDraft(sale.id, parsed)
      : await appCommands.sales.create(parsed)
    if (result.success) {
      notify.success(sale ? 'Cập nhật phiếu xuất nháp thành công' : 'Tạo phiếu xuất nháp thành công')
      onSuccess()
    }
    else setError(result.error ?? 'Không thể lưu phiếu xuất')
  }

  const add = () => {
    const productId = Number(selected)
    if (!productId) {
      notify.error('Vui lòng chọn một sản phẩm')
      return
    }
    const q = typeof quantity === 'number' ? quantity : 0
    if (q <= 0) {
      notify.error('Số lượng sản phẩm bán phải lớn hơn 0')
      return
    }
    const totalVal = typeof lineTotalSale === 'number' ? lineTotalSale : 0
    if (totalVal <= 0) {
      notify.error('Tổng giá trị xuất/bán phải lớn hơn 0')
      return
    }
    const prod = products.find(p => p.id === productId)
    if (prod && q > prod.currentStock) {
      notify.error(`Số lượng xuất (${q}) vượt quá tồn kho khả dụng (${prod.currentStock}) của ${prod.productName}`)
      return
    }
    if (items.some((item) => item.productId === productId)) {
      notify.error('Sản phẩm này đã có trong danh sách')
      return
    }
    setValue('items', [...items, { productId, quantity: q, lineTotalSale: totalVal }], { shouldValidate: true })
    setSelected('')
    setQuantity('')
    setLineTotalSale('')
  }

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
      title={preview ? 'Xem trước phiếu xuất' : sale ? 'Sửa phiếu xuất' : 'Tạo phiếu xuất'}
      size="xl"
      footer={
        <>
          <Button isLoading={isSubmitting} onClick={() => void handleSubmit(submit)()}>{preview ? 'Lưu nháp' : 'Xem trước'}</Button>
          <Button variant="secondary" onClick={() => (preview ? setPreview(false) : handleCloseAttempt())}>Quay lại</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Input label="Số HĐ điện tử" {...register('electronicInvoiceNumber')} placeholder="VD: HD001" />

          <Controller
            name="invoiceDate"
            control={control}
            render={({ field }) => (
              <DatePicker
                label="Ngày bán"
                required
                value={field.value}
                onChange={field.onChange}
                error={errors.invoiceDate?.message}
              />
            )}
          />

          <Select
            label="Loại người mua"
            {...register('buyerType')}
            options={[
              { value: 'khach_le', label: 'Khách lẻ' },
              { value: 'dai_ly', label: 'Đại lý' },
              { value: 'trang_trai', label: 'Trang trại' },
              { value: 'khac', label: 'Khác' },
            ]}
          />

          <Input label="Tên người mua" {...register('buyerName')} placeholder="Nhập tên người mua..." />
        </div>

        {!preview && (
          <div className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3 md:grid-cols-12 items-end">
            <div className="md:col-span-5">
              <ProductSearchCombobox
                label="Chọn sản phẩm"
                onSelect={(product) => setSelected(String(product.id))}
              />
              {selected && (() => {
                const selectedProd = products.find(p => String(p.id) === selected)
                if (selectedProd) {
                  return (
                    <p className="mt-1 text-xs text-gray-500 font-medium">
                      Đã chọn: <span className="text-primary-700">{selectedProd.productCode} — {selectedProd.productName} (tồn {selectedProd.currentStock})</span>
                    </p>
                  )
                }
                return null
              })()}
            </div>
            <div className="md:col-span-3">
              <Input
                label="Số lượng xuất"
                type="number"
                min={1}
                step={1}
                placeholder="Nhập số lượng"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            <div className="md:col-span-3">
              <CurrencyInput
                label="Tổng giá trị xuất/bán"
                value={lineTotalSale === '' ? 0 : lineTotalSale}
                onChange={(val) => setLineTotalSale(val || '')}
              />
            </div>
            <div className="md:col-span-1">
              <Button type="button" onClick={add} className="w-full">Thêm</Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {items.map((item, index) => {
            const product = products.find((p) => p.id === item.productId)
            const unit = product?.inventoryUnit ?? 'đơn vị'
            const effectiveUnitPrice = Math.round(item.lineTotalSale / item.quantity)
            const exceeds = product ? item.quantity > product.currentStock : false
            return (
              <div key={item.productId} className={`flex justify-between items-center rounded-lg p-3 text-sm border ${exceeds ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-900'}`}>
                <span>
                  <strong>{product?.productName ?? item.productId}</strong> ({product?.productCode}) — {item.quantity} {unit} — Tổng: <strong>{item.lineTotalSale.toLocaleString('vi-VN')} ₫</strong> ≈ {effectiveUnitPrice.toLocaleString('vi-VN')} ₫/{unit} · tồn sau: {(product?.currentStock ?? 0) - item.quantity} {exceeds && ' — vượt tồn!'}
                </span>
                {!preview && (
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-800 text-xs font-medium"
                    onClick={() => setValue('items', items.filter((_, i) => i !== index))}
                  >
                    Xóa
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {errors.items?.message && <p className="text-sm text-red-600">{errors.items.message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
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

