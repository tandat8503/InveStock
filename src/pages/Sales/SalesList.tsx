import { appCommands } from '@/lib/commands'
import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState, ErrorState, LoadingState, Pagination, SearchInput, Select, ConfirmDialog, DatePicker } from '@/components/ui'
import { Eye, Pencil, CheckCircle, Trash2, XCircle } from 'lucide-react'
import type { BuyerType, InvoiceStatus, PaginatedResult, SalesInvoiceDTO } from '@shared/ipc-types'
import { formatVND } from '@/utils/formatters'
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

  // Dialog States
  const [confirmSale, setConfirmSale] = useState<SalesInvoiceDTO | null>(null)
  const [cancelSale, setCancelSale] = useState<SalesInvoiceDTO | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [deleteSale, setDeleteSale] = useState<SalesInvoiceDTO | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await appCommands.sales.list({ page, pageSize: 20, search: search || undefined, buyerType: buyerType || undefined, status: status || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })
    if (result.data) { setData(result.data); setError('') } else setError(result.error ?? 'Không tải được phiếu xuất')
    setLoading(false)
  }, [buyerType, dateFrom, dateTo, page, search, status])

  useEffect(() => {
    setPage(1)
  }, [search, buyerType, status, dateFrom, dateTo])

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
  return <div className="flex h-full flex-col p-6"><div className="mb-6 flex justify-between"><div><h1 className="text-2xl font-bold">Xuất kho</h1><p className="text-sm text-gray-500">Phiếu xuất và hóa đơn bán hàng</p></div><Button onClick={() => setForm({ open: true })}>Tạo phiếu xuất</Button></div>
    <div className="card flex min-h-0 flex-1 flex-col">
    <div className="grid flex-shrink-0 gap-3 border-b border-gray-200 bg-gray-50 p-4 md:grid-cols-5"><SearchInput value={search} onChange={setSearch} placeholder="Mã phiếu, số HĐ, người mua..." />
      <Select value={buyerType} onChange={(e) => setBuyerType(e.target.value as BuyerType | '')} options={[{ value: '', label: 'Mọi người mua' }, { value: 'khach_le', label: 'Khách lẻ' }, { value: 'dai_ly', label: 'Đại lý' }, { value: 'trang_trai', label: 'Trang trại' }, { value: 'khac', label: 'Khác' }]} />
      <Select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus | '')} options={[{ value: '', label: 'Mọi trạng thái' }, { value: 'nhap', label: 'Nháp' }, { value: 'xac_nhan', label: 'Đã xác nhận' }, { value: 'huy', label: 'Đã hủy' }]} />
      <DatePicker placeholder="Từ ngày" value={dateFrom} onChange={(val) => setDateFrom(val)} />
      <DatePicker placeholder="Đến ngày" value={dateTo} onChange={(val) => setDateTo(val)} />
    </div>
    <div className="flex-1 overflow-auto bg-white">
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : !data?.items.length ? <EmptyState message="Chưa có phiếu xuất" /> :
      <table className="min-w-full text-sm"><thead className="sticky top-0 bg-gray-50"><tr>{['Mã phiếu', 'Số HĐ', 'Ngày bán', 'Loại người mua', 'Người mua', 'Giá xuất', 'Giá vốn', 'Trạng thái', 'Thao tác'].map((x) => <th key={x} className="px-3 py-3 text-left">{x}</th>)}</tr></thead>
      <tbody>{data.items.map((sale) => <tr key={sale.id} className="border-t"><td className="px-3 py-3 font-medium">{sale.issueCode}</td><td className="px-3">{sale.electronicInvoiceNumber ?? '—'}</td><td className="px-3">{sale.invoiceDate}</td><td className="px-3">{mapBuyerType(sale.buyerType)}</td><td className="px-3">{sale.buyerName ?? '—'}</td><td className="px-3">{formatVND(sale.grandTotal)}</td><td className="px-3">{sale.status === 'nhap' ? '—' : formatVND(sale.totalCost)}</td><td className="px-3"><SalesStatusBadge status={sale.status} /></td>
      <td className="px-3 py-1.5"><div className="flex items-center gap-1">
        <button className="text-gray-500 hover:text-primary-600 hover:bg-gray-100 p-1.5 rounded transition-colors" onClick={() => setDetailId(sale.id)} title="Xem chi tiết">
          <Eye size={16} />
        </button>
        {sale.status === 'nhap' && <>
          <button className="text-gray-500 hover:text-yellow-600 hover:bg-gray-100 p-1.5 rounded transition-colors" onClick={() => setForm({ open: true, sale })} title="Sửa nháp">
            <Pencil size={16} />
          </button>
          <button className="text-gray-500 hover:text-green-600 hover:bg-gray-100 p-1.5 rounded transition-colors" disabled={actionId !== null} onClick={() => void triggerConfirm(sale)} title="Xác nhận xuất kho">
            <CheckCircle size={16} />
          </button>
          <button className="text-gray-500 hover:text-red-600 hover:bg-gray-100 p-1.5 rounded transition-colors" onClick={() => setDeleteSale(sale)} title="Xóa nháp">
            <Trash2 size={16} />
          </button>
        </>}
        {sale.status === 'xac_nhan' && (
          <button className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-colors" disabled={actionId !== null} onClick={() => triggerCancel(sale)} title="Hủy phiếu xuất">
            <XCircle size={16} />
          </button>
        )}
      </div></td></tr>)}</tbody></table>}
    </div>
    {data && <div className="flex-shrink-0"><Pagination currentPage={page} pageSize={data.pageSize} totalItems={data.total} onPageChange={setPage} /></div>}
    </div>
    <SalesDetail id={detailId} onClose={() => setDetailId(null)} />
    <SalesForm open={form.open} sale={form.sale} onClose={() => setForm({ open: false })} onSuccess={() => { setForm({ open: false }); void load() }} />

    {/* Confirmation dialog for confirming sales invoice */}
    <ConfirmDialog
      isOpen={confirmSale !== null}
      title="Xác nhận xuất kho?"
      message={
        confirmSale && (
          <div className="space-y-1.5 text-sm">
            <p>Hành động này sẽ giảm tồn kho định lượng của các sản phẩm.</p>
            <div className="rounded-lg bg-gray-50 border p-2.5 space-y-1 mt-2">
              <p><strong>Người mua:</strong> {confirmSale.buyerName || 'Khách lẻ'}</p>
              <p><strong>Số lượng mặt hàng:</strong> {confirmSale.items?.length ?? 0}</p>
              <p><strong>Tổng số bao:</strong> {confirmSale.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0}</p>
              <p><strong>Giá xuất:</strong> {formatVND(confirmSale.grandTotal)}</p>
            </div>
          </div>
        )
      }
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

    {/* Confirmation dialog for deleting draft sales invoice */}
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

    {/* Confirmation dialog for cancelling confirmed sales invoice */}
    <ConfirmDialog
      isOpen={cancelSale !== null}
      title="Hủy phiếu xuất kho?"
      message={
        cancelSale && (
          <div className="space-y-3 text-sm">
            <p className="text-red-600 font-medium">Hành động này sẽ phục hồi tồn kho của các sản phẩm. Không thể hoàn tác!</p>
            <div className="rounded-lg bg-gray-50 border p-2.5 space-y-1">
              <p><strong>Mã phiếu:</strong> {cancelSale.issueCode}</p>
              <p><strong>Người mua:</strong> {cancelSale.buyerName || 'Khách lẻ'}</p>
              <p><strong>Tổng tiền:</strong> {formatVND(cancelSale.grandTotal)}</p>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">Lý do hủy phiếu *</label>
              <textarea
                className="form-input w-full"
                rows={2}
                required
                placeholder="Nhập lý do hủy phiếu xuất..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>
        )
      }
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
}
