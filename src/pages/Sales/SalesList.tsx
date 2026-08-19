import { appCommands } from '@/lib/commands'
import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState, ErrorState, LoadingState, Pagination, SearchInput, Select, ConfirmDialog, DatePicker } from '@/components/ui'
import { Eye, Pencil, CheckCircle, Trash2, XCircle, Plus } from 'lucide-react'
import type { BuyerType, InvoiceStatus, PaginatedResult, SalesInvoiceDTO } from '@shared/ipc-types'
import { formatVND, formatDate } from '@/utils/formatters'
import { SalesStatusBadge } from './SalesStatusBadge'
import { SalesDetail } from './SalesDetail'
import { SalesForm } from './SalesForm'
import { useNotify } from '@/stores/uiStore'

const mapBuyerType = (type: BuyerType): string => {
  switch (type) {
    case 'khach_le': return 'Khách lẻ'
    case 'dai_ly': return 'Đại lý'
    case 'trang_trai': return 'Trang trại'
    case 'khac': return 'Khác'
    default: return type
  }
}

export function SalesList() {
  const notify = useNotify()
  const [data, setData] = useState<PaginatedResult<SalesInvoiceDTO> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [buyerType, setBuyerType] = useState<BuyerType | ''>('')
  const [status, setStatus] = useState<InvoiceStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [form, setForm] = useState<{ open: boolean; sale?: SalesInvoiceDTO }>({ open: false })
  const [actionId, setActionId] = useState<number | null>(null)

  // Dialog states
  const [confirmSale, setConfirmSale] = useState<SalesInvoiceDTO | null>(null)
  const [cancelSale, setCancelSale] = useState<SalesInvoiceDTO | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [deleteSale, setDeleteSale] = useState<SalesInvoiceDTO | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await appCommands.sales.list({
      page, pageSize: 20,
      search: search || undefined,
      buyerType: buyerType || undefined,
      status: status || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
    if (result.data) { setData(result.data); setError('') }
    else setError(result.error ?? 'Không tải được phiếu xuất')
    setLoading(false)
  }, [buyerType, dateFrom, dateTo, page, search, status])

  useEffect(() => { setPage(1) }, [search, buyerType, status, dateFrom, dateTo])
  useEffect(() => { void load() }, [load])

  const triggerConfirm = async (sale: SalesInvoiceDTO) => {
    setActionId(sale.id)
    const detail = await appCommands.sales.get(sale.id)
    if (detail.success && detail.data) {
      setConfirmSale(detail.data)
    } else {
      notify.error(detail.error ?? 'Không tải được chi tiết phiếu xuất')
    }
    setActionId(null)
  }

  const triggerCancel = (sale: SalesInvoiceDTO) => {
    setCancelSale(sale)
    setCancelReason('')
  }

  return (
    <div className="flex h-full flex-col p-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Xuất kho</h1>
          <p className="page-subtitle">Phiếu xuất và hóa đơn bán hàng</p>
        </div>
        <Button onClick={() => setForm({ open: true })}>
          <Plus size={16} />
          Tạo phiếu xuất
        </Button>
      </div>

      {/* Card */}
      <div className="card flex min-h-0 flex-1 flex-col">
        {/* Filters */}
        <div className="flex-shrink-0 border-b border-slate-200 bg-slate-50/60 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <SearchInput value={search} onChange={setSearch} placeholder="Mã phiếu, số HĐ, người mua..." />
            <Select
              value={buyerType}
              onChange={(e) => setBuyerType(e.target.value as BuyerType | '')}
              options={[
                { value: '', label: 'Mọi người mua' },
                { value: 'khach_le', label: 'Khách lẻ' },
                { value: 'dai_ly', label: 'Đại lý' },
                { value: 'trang_trai', label: 'Trang trại' },
                { value: 'khac', label: 'Khác' },
              ]}
            />
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as InvoiceStatus | '')}
              options={[
                { value: '', label: 'Mọi trạng thái' },
                { value: 'nhap', label: 'Nháp' },
                { value: 'xac_nhan', label: 'Đã xác nhận' },
                { value: 'huy', label: 'Đã hủy' },
              ]}
            />
            <DatePicker placeholder="Từ ngày" value={dateFrom} onChange={setDateFrom} />
            <DatePicker placeholder="Đến ngày" value={dateTo} onChange={setDateTo} />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={() => { void load() }} />
          ) : !data?.items.length ? (
            <EmptyState
              title="Chưa có phiếu xuất"
              message="Tạo phiếu xuất đầu tiên để bắt đầu."
              action={<Button onClick={() => setForm({ open: true })}><Plus size={16} />Tạo phiếu xuất</Button>}
            />
          ) : (
            <table className="table table-sticky w-full">
              <thead>
                <tr>
                  <th>Mã phiếu</th>
                  <th>Số HĐ</th>
                  <th>Ngày bán</th>
                  <th>Loại người mua</th>
                  <th>Người mua</th>
                  <th className="text-right">Giá xuất</th>
                  <th className="text-right">Giá vốn</th>
                  <th className="text-center">Trạng thái</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((sale) => (
                  <tr key={sale.id}>
                    <td className="font-medium text-slate-900">{sale.issueCode}</td>
                    <td className="text-slate-500">{sale.electronicInvoiceNumber ?? '—'}</td>
                    <td className="text-slate-500">{formatDate(sale.invoiceDate)}</td>
                    <td className="text-slate-500">{mapBuyerType(sale.buyerType)}</td>
                    <td className="text-slate-700">{sale.buyerName ?? '—'}</td>
                    <td className="text-right font-semibold text-slate-900">{formatVND(sale.grandTotal)}</td>
                    <td className="text-right text-slate-500">
                      {sale.status === 'nhap' ? '—' : formatVND(sale.totalCost)}
                    </td>
                    <td className="text-center">
                      <SalesStatusBadge status={sale.status} />
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-primary-600"
                          onClick={() => setDetailId(sale.id)}
                          title="Xem chi tiết"
                        >
                          <Eye size={16} />
                        </button>
                        {sale.status === 'nhap' && (
                          <>
                            <button
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600"
                              onClick={() => setForm({ open: true, sale })}
                              title="Sửa nháp"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40"
                              disabled={actionId !== null}
                              onClick={() => { void triggerConfirm(sale) }}
                              title="Xác nhận xuất kho"
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              onClick={() => setDeleteSale(sale)}
                              title="Xóa nháp"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                        {sale.status === 'xac_nhan' && (
                          <button
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                            disabled={actionId !== null}
                            onClick={() => triggerCancel(sale)}
                            title="Hủy phiếu xuất"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {data && (
          <Pagination currentPage={page} pageSize={data.pageSize} totalItems={data.total} onPageChange={setPage} />
        )}
      </div>

      {/* Modals */}
      <SalesDetail id={detailId} onClose={() => setDetailId(null)} />
      <SalesForm
        open={form.open}
        sale={form.sale}
        onClose={() => setForm({ open: false })}
        onSuccess={() => { setForm({ open: false }); void load() }}
      />

      {/* Confirm sale */}
      <ConfirmDialog
        isOpen={confirmSale !== null}
        title="Xác nhận xuất kho?"
        message={confirmSale && (
          <div className="space-y-2 text-sm">
            <p>Hành động này sẽ giảm tồn kho định lượng của các sản phẩm.</p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
              <p><strong>Người mua:</strong> {confirmSale.buyerName || 'Khách lẻ'}</p>
              <p><strong>Số lượng mặt hàng:</strong> {confirmSale.items?.length ?? 0}</p>
              <p><strong>Tổng số bao:</strong> {confirmSale.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0}</p>
              <p><strong>Giá xuất:</strong> {formatVND(confirmSale.grandTotal)}</p>
            </div>
          </div>
        )}
        confirmText="Xác nhận"
        cancelText="Quay lại"
        type="warning"
        isLoading={actionId !== null}
        onConfirm={() => {
          void (async () => {
            if (!confirmSale) return
            setActionId(confirmSale.id)
            const result = await appCommands.sales.confirm(confirmSale.id)
            if (result.success) {
              notify.success('Xác nhận phiếu xuất thành công')
              setConfirmSale(null)
              await load()
            } else {
              notify.error(result.error ?? 'Không thể xác nhận phiếu xuất')
            }
            setActionId(null)
          })()
        }}
        onCancel={() => setConfirmSale(null)}
      />

      {/* Delete draft */}
      <ConfirmDialog
        isOpen={deleteSale !== null}
        title={`Xóa phiếu nháp ${deleteSale?.issueCode}?`}
        message="Hành động này sẽ xóa vĩnh viễn phiếu xuất nháp này. Phiếu này chưa ảnh hưởng tồn kho."
        confirmText="Xóa phiếu"
        cancelText="Quay lại"
        type="danger"
        isLoading={actionId !== null}
        onConfirm={() => {
          void (async () => {
            if (!deleteSale) return
            setActionId(deleteSale.id)
            const result = await appCommands.sales.deleteDraft(deleteSale.id)
            if (result.success) {
              notify.success('Xóa phiếu nháp thành công')
              setDeleteSale(null)
              await load()
            } else {
              notify.error(result.error ?? 'Không thể xóa phiếu nháp')
            }
            setActionId(null)
          })()
        }}
        onCancel={() => setDeleteSale(null)}
      />

      {/* Cancel confirmed sale */}
      <ConfirmDialog
        isOpen={cancelSale !== null}
        title="Hủy phiếu xuất kho?"
        message={cancelSale && (
          <div className="space-y-3 text-sm">
            <p className="text-red-600 font-medium">Hành động này sẽ phục hồi tồn kho của các sản phẩm. Không thể hoàn tác!</p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
              <p><strong>Mã phiếu:</strong> {cancelSale.issueCode}</p>
              <p><strong>Người mua:</strong> {cancelSale.buyerName || 'Khách lẻ'}</p>
              <p><strong>Tổng tiền:</strong> {formatVND(cancelSale.grandTotal)}</p>
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Lý do hủy phiếu *</label>
              <textarea
                className="form-input w-full resize-none"
                rows={2}
                required
                placeholder="Nhập lý do hủy phiếu xuất..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>
        )}
        confirmText="Xác nhận Hủy"
        cancelText="Quay lại"
        type="danger"
        isLoading={actionId !== null}
        onConfirm={() => {
          void (async () => {
            if (!cancelSale) return
            if (!cancelReason.trim()) {
              notify.error('Vui lòng nhập lý do hủy')
              return
            }
            setActionId(cancelSale.id)
            const result = await appCommands.sales.cancel(cancelSale.id, cancelReason)
            if (result.success) {
              notify.success('Hủy phiếu xuất thành công')
              setCancelSale(null)
              await load()
            } else {
              notify.error(result.error ?? 'Không thể hủy phiếu xuất')
            }
            setActionId(null)
          })()
        }}
        onCancel={() => setCancelSale(null)}
      />
    </div>
  )
}
