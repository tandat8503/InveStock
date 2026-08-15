import { appCommands } from '@/lib/commands'
import { useEffect, useState } from 'react'
import { Modal, Button, Input, Select, CurrencyInput, ConfirmDialog, UnsavedChangesDialog, DatePicker } from '@/components/ui'
import type { ProductDTO, InventoryAdjustmentDTO } from '@shared/ipc-types'
import { formatVND } from '@/utils/formatters'
import { useNotify } from '@/stores/uiStore'
import { localDateISO } from '@/utils/localDate'

export function InventoryAdjustmentModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const notify = useNotify()
  const [activeTab, setActiveTab] = useState<'adjust' | 'history'>('adjust')
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [adjustments, setAdjustments] = useState<InventoryAdjustmentDTO[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Form states
  const [productId, setProductId] = useState('')
  const [actualStock, setActualStock] = useState<number | ''>('')
  const [reason, setReason] = useState('kiem_ke')
  const [notes, setNotes] = useState('')
  const [adjustmentDate, setAdjustmentDate] = useState(localDateISO())
  const [adjustmentUnitCost, setAdjustmentUnitCost] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const [showAdjustmentConfirm, setShowAdjustmentConfirm] = useState(false)

  const selectedProduct = products.find((p) => p.id === Number(productId))
  const systemStock = selectedProduct ? selectedProduct.currentStock : 0
  const difference = actualStock !== '' ? Number(actualStock) - systemStock : 0

  useEffect(() => {
    if (isOpen) {
      void appCommands.products.list({ activeOnly: true, page: 1, pageSize: 500 }).then((res) => {
        if (res.data) setProducts(res.data.items)
      })
      resetForm()
      loadHistory()
    }
  }, [isOpen])

  const loadHistory = () => {
    setLoadingHistory(true)
    void appCommands.inventory.adjustments().then((res) => {
      if (res.data) setAdjustments(res.data)
      setLoadingHistory(false)
    })
  }

  const resetForm = () => {
    setProductId('')
    setActualStock('')
    setReason('kiem_ke')
    setNotes('')
    setAdjustmentDate(localDateISO())
    setAdjustmentUnitCost(0)
    setIsDirty(false)
  }

  const handleProductChange = (val: string) => {
    setProductId(val)
    const prod = products.find((p) => p.id === Number(val))
    if (prod) {
      setAdjustmentUnitCost(prod.averageCost)
    }
    setIsDirty(true)
  }

  const requestSubmit = () => {
    if (!productId) {
      notify.error('Vui lòng chọn sản phẩm')
      return
    }
    if (actualStock === '') {
      notify.error('Vui lòng nhập số lượng thực tế')
      return
    }
    if (Number(actualStock) < 0) {
      notify.error('Tồn thực tế không được nhỏ hơn 0.')
      return
    }
    if (difference === 0) {
      notify.error('Số lượng thực tế bằng số lượng hệ thống, không cần điều chỉnh')
      return
    }

    if (difference > 0 && adjustmentUnitCost < 0) {
      notify.error('Giá vốn điều chỉnh không được nhỏ hơn 0.')
      return
    }
    setShowAdjustmentConfirm(true)
  }

  const confirmSubmit = async () => {
    if (submitting || !selectedProduct || actualStock === '') return
    setSubmitting(true)
    const res = await appCommands.inventory.createAdjustment({
      productId: Number(productId),
      actualStock: Number(actualStock),
      reason,
      notes: notes.trim() || undefined,
      adjustmentDate,
      adjustmentUnitCost: difference > 0 ? adjustmentUnitCost : undefined,
    })

    if (res.success) {
      setShowAdjustmentConfirm(false)
      notify.success('Đã điều chỉnh tồn kho thành công.')
      resetForm()
      loadHistory()
      setActiveTab('history')
    } else {
      notify.error(res.error ?? 'Lỗi điều chỉnh tồn kho')
    }
    setSubmitting(false)
  }

  const handleCloseAttempt = () => {
    if (isDirty && activeTab === 'adjust') {
      setShowUnsavedConfirm(true)
    } else {
      onClose()
    }
  }

  const translateReason = (r: string) => {
    switch (r) {
      case 'kiem_ke':
        return 'Kiểm kê'
      case 'hong_mat':
        return 'Hỏng mất'
      case 'nhap_sai':
        return 'Sửa sai nhập'
      case 'xuat_sai':
        return 'Sửa sai xuất'
      default:
        return 'Khác'
    }
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleCloseAttempt}
        title="Điều chỉnh tồn kho"
        size="xl"
        footer={
          activeTab === 'adjust' ? (
            <>
              <Button onClick={requestSubmit} isLoading={submitting}>
                Lưu điều chỉnh
              </Button>
              <Button variant="secondary" onClick={handleCloseAttempt} disabled={submitting}>
                Hủy
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Đóng
            </Button>
          )
        }
      >
        <div className="flex border-b border-gray-200 mb-4">
          <button
            className={`py-2 px-4 font-semibold text-sm border-b-2 ${
              activeTab === 'adjust'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('adjust')}
          >
            Lập phiếu điều chỉnh
          </button>
          <button
            className={`py-2 px-4 font-semibold text-sm border-b-2 ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => {
              setActiveTab('history')
              loadHistory()
            }}
          >
            Lịch sử điều chỉnh
          </button>
        </div>

        {activeTab === 'adjust' ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label="Chọn sản phẩm"
                required
                value={productId}
                onChange={(e) => handleProductChange(e.target.value)}
                options={[
                  { value: '', label: 'Chọn sản phẩm cần điều chỉnh...' },
                  ...products.map((p) => ({
                    value: String(p.id),
                    label: `${p.productCode} — ${p.productName} (tồn hiện tại: ${p.currentStock} ${p.inventoryUnit})`,
                  })),
                ]}
              />

              <ControllerWrapper label="Ngày điều chỉnh">
                <DatePicker
                  value={adjustmentDate}
                  onChange={(val) => {
                    setAdjustmentDate(val)
                    setIsDirty(true)
                  }}
                />
              </ControllerWrapper>
            </div>

            {selectedProduct && (
              <div className="rounded-lg bg-gray-50 border p-3 text-sm space-y-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <p>
                    <span className="text-gray-500">Mã sản phẩm</span>
                    <br />
                    <strong>{selectedProduct.productCode}</strong>
                  </p>
                  <p>
                    <span className="text-gray-500">Tồn hệ thống</span>
                    <br />
                    <strong>
                      {systemStock} {selectedProduct.inventoryUnit}
                    </strong>
                  </p>
                  <p>
                    <span className="text-gray-500">Giá vốn bình quân</span>
                    <br />
                    <strong>{formatVND(selectedProduct.averageCost)}</strong>
                  </p>
                  <p>
                    <span className="text-gray-500">Tổng giá trị tồn</span>
                    <br />
                    <strong>{formatVND(selectedProduct.currentInventoryValue)}</strong>
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <Input
                label="Tồn thực tế"
                type="number"
                min={0}
                required
                value={actualStock === '' ? '' : String(actualStock)}
                onChange={(e) => {
                  setActualStock(e.target.value === '' ? '' : Number(e.target.value))
                  setIsDirty(true)
                }}
                placeholder="Nhập số lượng kiểm kê thực tế..."
              />

              <ControllerWrapper label="Lệch kiểm kê">
                <div
                  className={`form-input w-full bg-gray-50 flex items-center font-bold ${
                    difference > 0 ? 'text-green-600' : difference < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}
                >
                  {difference > 0 ? `+${difference}` : difference}
                </div>
              </ControllerWrapper>

              <Select
                label="Lý do điều chỉnh"
                required
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  setIsDirty(true)
                }}
                options={[
                  { value: 'kiem_ke', label: 'Kiểm kê kho định kỳ' },
                  { value: 'hong_mat', label: 'Hao hụt hỏng mát' },
                  { value: 'nhap_sai', label: 'Sửa sai lệch hóa đơn nhập' },
                  { value: 'xuat_sai', label: 'Sửa sai lệch hóa đơn xuất' },
                  { value: 'khac', label: 'Khác' },
                ]}
              />
            </div>

            {difference > 0 && (
              <div className="max-w-md">
                <CurrencyInput
                  label="Giá vốn áp dụng cho phần tăng thêm"
                  value={adjustmentUnitCost}
                  onChange={(val) => {
                    setAdjustmentUnitCost(val)
                    setIsDirty(true)
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Mặc định theo giá vốn bình quân hiện tại: {formatVND(selectedProduct?.averageCost ?? 0)}
                </p>
              </div>
            )}

            <Input
              label="Ghi chú"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
                setIsDirty(true)
              }}
              placeholder="Nhập lý do chi tiết hoặc ghi chú..."
            />
          </div>
        ) : (
          <div className="space-y-3 overflow-auto max-h-[500px]">
            {loadingHistory ? (
              <div className="py-4 text-center text-sm text-gray-500">Đang tải...</div>
            ) : adjustments.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">Chưa có lịch sử điều chỉnh tồn kho.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-50 font-semibold text-gray-700">
                    <th className="py-2 px-3 text-left">Ngày</th>
                    <th className="py-2 px-3 text-left">Sản phẩm</th>
                    <th className="py-2 px-3 text-right">Hệ thống</th>
                    <th className="py-2 px-3 text-right">Thực tế</th>
                    <th className="py-2 px-3 text-right">Chênh lệch</th>
                    <th className="py-2 px-3 text-left">Lý do</th>
                    <th className="py-2 px-3 text-left">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {adjustments.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50/50">
                      <td className="py-2 px-3">{a.adjustmentDate}</td>
                      <td className="py-2 px-3">
                        <span className="font-medium text-gray-900">{a.productName}</span>
                        <br />
                        <span className="text-xs text-gray-500">{a.productCode}</span>
                      </td>
                      <td className="py-2 px-3 text-right text-gray-600">{a.systemStock}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{a.actualStock}</td>
                      <td
                        className={`py-2 px-3 text-right font-semibold ${
                          a.difference > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {a.difference > 0 ? `+${a.difference}` : a.difference}
                      </td>
                      <td className="py-2 px-3">{translateReason(a.reason)}</td>
                      <td className="py-2 px-3 text-gray-500 max-w-[200px] truncate" title={a.notes ?? ''}>
                        {a.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Modal>

      {/* Unsaved changes confirmation dialog */}
      <ConfirmDialog
        isOpen={showAdjustmentConfirm}
        title="Xác nhận điều chỉnh tồn kho?"
        message={selectedProduct && actualStock !== '' ? (
          <div className="space-y-2 text-left">
            <p><strong>Tên sản phẩm:</strong> {selectedProduct.productName}</p>
            <p><strong>Tồn hệ thống:</strong> {systemStock} {selectedProduct.inventoryUnit}</p>
            <p><strong>Tồn thực tế:</strong> {actualStock} {selectedProduct.inventoryUnit}</p>
            <p><strong>Chênh lệch:</strong> {difference > 0 ? '+' : ''}{difference} {selectedProduct.inventoryUnit}</p>
            <p><strong>Lý do:</strong> {translateReason(reason)}</p>
            <p className="pt-1">Thao tác này sẽ thay đổi tồn kho và được ghi vào lịch sử. Bạn có chắc chắn muốn tiếp tục?</p>
          </div>
        ) : ''}
        confirmText="Xác nhận điều chỉnh"
        cancelText="Quay lại"
        type="warning"
        isLoading={submitting}
        onConfirm={() => { void confirmSubmit() }}
        onCancel={() => { if (!submitting) setShowAdjustmentConfirm(false) }}
      />

      <UnsavedChangesDialog
        isOpen={showUnsavedConfirm}
        mode="adjustment"
        onDiscard={() => { setShowUnsavedConfirm(false); onClose() }}
        onContinue={() => setShowUnsavedConfirm(false)}
      />
    </>
  )
}

function ControllerWrapper({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </div>
  )
}

