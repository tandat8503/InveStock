import { appCommands } from '@/lib/commands'
import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState, ErrorState, LoadingState, Pagination, SearchInput, Select, ConfirmDialog, DatePicker } from '@/components/ui'
import type { InvoiceStatus, PaginatedResult, PurchaseInvoiceDTO, SupplierDTO } from '@shared/ipc-types'
import { formatVND } from '@/utils/formatters'
import { PurchaseStatusBadge } from './PurchaseStatusBadge'
import { PurchaseDetail } from './PurchaseDetail'
import { PurchaseForm } from './PurchaseForm'
import { useNotify } from '@/stores/uiStore'

export function PurchaseList() {
  const notify = useNotify()
  const [data, setData] = useState<PaginatedResult<PurchaseInvoiceDTO> | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [status, setStatus] = useState<InvoiceStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [form, setForm] = useState<{ open: boolean; invoice?: PurchaseInvoiceDTO }>({ open: false })
  const [actionId, setActionId] = useState<number | null>(null)

  // Dialog States
  const [confirmInvoice, setConfirmInvoice] = useState<PurchaseInvoiceDTO | null>(null)
  const [cancelInvoice, setCancelInvoice] = useState<PurchaseInvoiceDTO | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [deleteInvoice, setDeleteInvoice] = useState<PurchaseInvoiceDTO | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const result = await appCommands.purchases.list({
      page, pageSize: 20, search: search || undefined,
      supplierId: supplierId ? Number(supplierId) : undefined,
      status: status || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
    })
    if (result.success && result.data) setData(result.data)
    else setError(result.error ?? 'Không tải được danh sách phiếu nhập')
    setLoading(false)
  }, [dateFrom, dateTo, page, search, status, supplierId])
  useEffect(() => {
    setPage(1)
  }, [search, supplierId, status, dateFrom, dateTo])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void appCommands.suppliers.list({ activeOnly: false }).then((result) => { if (result.data) setSuppliers(result.data.items) }) }, [])

  const triggerConfirm = async (invoice: PurchaseInvoiceDTO) => {
    setActionId(invoice.id)
    const detail = await appCommands.purchases.get(invoice.id)
    if (detail.success && detail.data) {
      setConfirmInvoice(detail.data)
    } else {
      notify.error(detail.error ?? 'Không tải được chi tiết phiếu nhập')
    }
    setActionId(null)
  }

  const triggerCancel = (invoice: PurchaseInvoiceDTO) => {
    setCancelInvoice(invoice)
    setCancelReason('')
  }
  return <div className="flex h-full flex-col p-6">
    <div className="mb-6 flex items-center justify-between"><div><h1 className="text-2xl font-bold">Nhập kho</h1><p className="text-sm text-gray-500">Theo dõi phiếu nhập và giá trị nhập kho</p></div><Button onClick={() => setForm({ open: true })}>Tạo phiếu nhập</Button></div>
    <div className="card flex min-h-0 flex-1 flex-col">
    <div className="grid flex-shrink-0 gap-3 border-b border-gray-200 bg-gray-50 p-4 md:grid-cols-5">
      <SearchInput value={search} onChange={setSearch} placeholder="Mã phiếu, số hóa đơn..." />
      <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} options={[{ value: '', label: 'Tất cả nhà cung cấp' }, ...suppliers.map((supplier) => ({ value: String(supplier.id), label: supplier.companyName }))]} />
      <Select value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatus | '')} options={[{ value: '', label: 'Tất cả trạng thái' }, { value: 'nhap', label: 'Nháp' }, { value: 'xac_nhan', label: 'Đã xác nhận' }, { value: 'huy', label: 'Đã hủy' }]} />
      <DatePicker placeholder="Từ ngày" value={dateFrom} onChange={(val) => setDateFrom(val)} />
      <DatePicker placeholder="Đến ngày" value={dateTo} onChange={(val) => setDateTo(val)} />
    </div>
    <div className="flex-1 overflow-auto bg-white">
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : !data?.items.length ? <EmptyState title="Chưa có phiếu nhập" message="Tạo phiếu nhập đầu tiên để bắt đầu." /> :
      <table className="min-w-full text-sm"><thead className="sticky top-0 bg-gray-50"><tr>
        {['Mã phiếu', 'Số HĐ', 'Ngày HĐ', 'Ngày nhập', 'Nhà cung cấp', 'Tổng tiền', 'Trạng thái', 'Thao tác'].map((label) => <th key={label} className="whitespace-nowrap px-3 py-3 text-left">{label}</th>)}
      </tr></thead><tbody>{data.items.map((invoice) => <tr key={invoice.id} className="border-t">
        <td className="px-3 py-3 font-medium">{invoice.receiptCode}</td><td className="px-3">{invoice.invoiceNumber}</td><td className="px-3">{invoice.invoiceDate}</td><td className="px-3">{invoice.receivedDate}</td><td className="px-3">{invoice.supplierName}</td>
        <td className="px-3">{formatVND(invoice.grandTotal)}</td><td className="px-3"><PurchaseStatusBadge status={invoice.status} /></td>
        <td className="space-x-1 whitespace-nowrap px-3"><Button size="sm" variant="ghost" onClick={() => setDetailId(invoice.id)}>Xem</Button>
          {invoice.status === 'nhap' && <><Button size="sm" variant="ghost" onClick={() => setForm({ open: true, invoice })}>Sửa</Button><Button size="sm" disabled={actionId !== null} onClick={() => void triggerConfirm(invoice)}>Xác nhận</Button><Button size="sm" variant="ghost" onClick={() => setDeleteInvoice(invoice)}>Xóa</Button></>}
          {invoice.status === 'xac_nhan' && <Button size="sm" variant="danger" disabled={actionId !== null} onClick={() => triggerCancel(invoice)}>Hủy phiếu</Button>}
        </td>
      </tr>)}</tbody></table>}
    </div>
    {data && <div className="flex-shrink-0"><Pagination currentPage={page} pageSize={data.pageSize} totalItems={data.total} onPageChange={setPage} /></div>}
    </div>
    <PurchaseDetail id={detailId} onClose={() => { setDetailId(null); void load(); }} />
    <PurchaseForm open={form.open} invoice={form.invoice} onClose={() => setForm({ open: false })} onSuccess={() => { setForm({ open: false }); void load() }} />

    {/* Confirmation dialog for confirming purchase invoice */}
    <ConfirmDialog
      isOpen={confirmInvoice !== null}
      title="Xác nhận nhập kho?"
      message={
        confirmInvoice && (
          <div className="space-y-1.5 text-sm">
            <p>Hành động này sẽ tăng tồn kho theo số lượng và giá trị của phiếu nhập.</p>
            <div className="rounded-lg bg-gray-50 border p-2.5 space-y-1 mt-2">
              <p><strong>Nhà cung cấp:</strong> {confirmInvoice.supplierName}</p>
              <p><strong>Số lượng mặt hàng:</strong> {confirmInvoice.items?.length ?? 0}</p>
              <p><strong>Tổng số bao:</strong> {confirmInvoice.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0}</p>
              <p><strong>Tổng giá trị nhập:</strong> {formatVND(confirmInvoice.grandTotal)}</p>
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
          if (!confirmInvoice) return
          setActionId(confirmInvoice.id)
          const result = await appCommands.purchases.confirm(confirmInvoice.id)
          if (result.success) {
            notify.success('Xác nhận phiếu nhập thành công')
            setConfirmInvoice(null)
            await load()
          } else {
            notify.error(result.error ?? 'Không thể xác nhận phiếu nhập')
          }
          setActionId(null)
        })()
      }}
      onCancel={() => setConfirmInvoice(null)}
    />

    {/* Confirmation dialog for deleting draft purchase invoice */}
    <ConfirmDialog
      isOpen={deleteInvoice !== null}
      title={`Xóa phiếu nháp ${deleteInvoice?.receiptCode}?`}
      message="Hành động này sẽ xóa vĩnh viễn phiếu nhập nháp này. Phiếu này chưa ảnh hưởng tồn kho."
      confirmText="Xóa phiếu"
      cancelText="Quay lại"
      type="danger"
      isLoading={actionId !== null}
      onConfirm={() => {
        void (async () => {
          if (!deleteInvoice) return
          setActionId(deleteInvoice.id)
          const result = await appCommands.purchases.deleteDraft(deleteInvoice.id)
          if (result.success) {
            notify.success('Xóa phiếu nháp thành công')
            setDeleteInvoice(null)
            await load()
          } else {
            notify.error(result.error ?? 'Không thể xóa phiếu nháp')
          }
          setActionId(null)
        })()
      }}
      onCancel={() => setDeleteInvoice(null)}
    />

    {/* Confirmation dialog for cancelling confirmed purchase invoice */}
    <ConfirmDialog
      isOpen={cancelInvoice !== null}
      title="Hủy phiếu nhập kho?"
      message={
        cancelInvoice && (
          <div className="space-y-3 text-sm">
            <p className="text-red-600 font-medium">Hành động này sẽ hoàn kho (trừ tồn) và điều chỉnh giảm công nợ NCC. Không thể hủy phiếu nếu đã có phát sinh thanh toán (cần hủy thanh toán trước). Không thể hoàn tác!</p>
            <div className="rounded-lg bg-gray-50 border p-2.5 space-y-1">
              <p><strong>Mã phiếu:</strong> {cancelInvoice.receiptCode}</p>
              <p><strong>Nhà cung cấp:</strong> {cancelInvoice.supplierName}</p>
              <p><strong>Tổng tiền:</strong> {formatVND(cancelInvoice.grandTotal)}</p>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">Lý do hủy phiếu *</label>
              <textarea
                className="form-input w-full"
                rows={2}
                required
                placeholder="Nhập lý do hủy phiếu nhập..."
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
          if (!cancelInvoice) return
          if (!cancelReason.trim()) {
            notify.error('Vui lòng nhập lý do hủy')
            return
          }
          setActionId(cancelInvoice.id)
          const result = await appCommands.purchases.cancel(cancelInvoice.id, cancelReason)
          if (result.success) {
            notify.success('Hủy phiếu nhập thành công')
            setCancelInvoice(null)
            await load()
          } else {
            notify.error(result.error ?? 'Không thể hủy phiếu nhập')
          }
          setActionId(null)
        })()
      }}
      onCancel={() => setCancelInvoice(null)}
    />
  </div>
}
