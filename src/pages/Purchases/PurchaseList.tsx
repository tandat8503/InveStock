import { appCommands } from '@/lib/commands'
import { useCallback, useEffect, useState } from 'react'
import { Plus, Eye, Check, Trash2, XCircle } from 'lucide-react'
import {
  Button, EmptyState, ErrorState, LoadingState,
  Pagination, SearchInput, Select, ConfirmDialog, DatePicker,
} from '@/components/ui'
import type { InvoiceStatus, PaginatedResult, PurchaseInvoiceDTO, SupplierDTO } from '@shared/ipc-types'
import { formatVND, formatDate } from '@/utils/formatters'
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

  // Dialog states
  const [confirmInvoice, setConfirmInvoice] = useState<PurchaseInvoiceDTO | null>(null)
  const [cancelInvoice, setCancelInvoice] = useState<PurchaseInvoiceDTO | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [deleteInvoice, setDeleteInvoice] = useState<PurchaseInvoiceDTO | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const result = await appCommands.purchases.list({
      page, pageSize: 20,
      search: search || undefined,
      supplierId: supplierId ? Number(supplierId) : undefined,
      status: status || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
    if (result.success && result.data) setData(result.data)
    else setError(result.error ?? 'Không tải được danh sách phiếu nhập')
    setLoading(false)
  }, [dateFrom, dateTo, page, search, status, supplierId])

  useEffect(() => { setPage(1) }, [search, supplierId, status, dateFrom, dateTo])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    void appCommands.suppliers.list({ activeOnly: false }).then((result) => {
      if (result.data) setSuppliers(result.data.items)
    })
  }, [])

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

  return (
    <div className="flex h-full flex-col p-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Nhập kho</h1>
          <p className="page-subtitle">Theo dõi phiếu nhập và giá trị nhập kho</p>
        </div>
        <Button onClick={() => setForm({ open: true })}>
          <Plus size={16} />
          Tạo phiếu nhập
        </Button>
      </div>

      {/* Card */}
      <div className="card flex min-h-0 flex-1 flex-col">
        {/* Filters */}
        <div className="flex-shrink-0 border-b border-slate-200 bg-slate-50/60 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <SearchInput value={search} onChange={setSearch} placeholder="Mã phiếu, số hóa đơn..." />
            <Select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              options={[
                { value: '', label: 'Tất cả nhà cung cấp' },
                ...suppliers.map((s) => ({ value: String(s.id), label: s.companyName })),
              ]}
            />
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as InvoiceStatus | '')}
              options={[
                { value: '', label: 'Tất cả trạng thái' },
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
              title="Chưa có phiếu nhập"
              message="Tạo phiếu nhập đầu tiên để bắt đầu."
              action={<Button onClick={() => setForm({ open: true })}><Plus size={16} />Tạo phiếu nhập</Button>}
            />
          ) : (
            <table className="table table-sticky w-full">
              <thead>
                <tr>
                  <th>Mã phiếu</th>
                  <th>Số HĐ</th>
                  <th>Ngày HĐ</th>
                  <th>Ngày nhập</th>
                  <th>Nhà cung cấp</th>
                  <th className="text-right">Tổng tiền</th>
                  <th className="text-center">Trạng thái</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="font-medium text-slate-900">{invoice.receiptCode}</td>
                    <td className="text-slate-500">{invoice.invoiceNumber}</td>
                    <td className="text-slate-500">{formatDate(invoice.invoiceDate)}</td>
                    <td className="text-slate-500">{formatDate(invoice.receivedDate)}</td>
                    <td className="text-slate-700">{invoice.supplierName}</td>
                    <td className="text-right font-semibold text-slate-900">{formatVND(invoice.grandTotal)}</td>
                    <td className="text-center">
                      <PurchaseStatusBadge status={invoice.status} />
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-primary-600"
                          onClick={() => setDetailId(invoice.id)}
                          title="Xem"
                        >
                          <Eye size={16} />
                        </button>
                        {invoice.status === 'nhap' && (
                          <>
                            <button
                              className="flex h-8 px-2 items-center justify-center rounded-lg text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                              onClick={() => setForm({ open: true, invoice })}
                            >
                              Sửa
                            </button>
                            <button
                              className="flex h-8 items-center gap-1 rounded-lg bg-primary-50 px-2 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-40"
                              disabled={actionId !== null}
                              onClick={() => { void triggerConfirm(invoice) }}
                            >
                              <Check size={14} />
                              Xác nhận
                            </button>
                            <button
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              onClick={() => setDeleteInvoice(invoice)}
                              title="Xóa"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                        {invoice.status === 'xac_nhan' && (
                          <button
                            className="flex h-8 items-center gap-1 rounded-lg bg-red-50 px-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40"
                            disabled={actionId !== null}
                            onClick={() => triggerCancel(invoice)}
                          >
                            <XCircle size={14} />
                            Hủy phiếu
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
          <Pagination
            currentPage={page}
            pageSize={data.pageSize}
            totalItems={data.total}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* Modals */}
      <PurchaseDetail
        id={detailId}
        onClose={() => { setDetailId(null); void load() }}
      />
      <PurchaseForm
        open={form.open}
        invoice={form.invoice}
        onClose={() => setForm({ open: false })}
        onSuccess={() => { setForm({ open: false }); void load() }}
      />

      {/* Confirm purchase */}
      <ConfirmDialog
        isOpen={confirmInvoice !== null}
        title="Xác nhận nhập kho?"
        message={
          confirmInvoice && (
            <div className="space-y-2 text-sm">
              <p>Hành động này sẽ tăng tồn kho theo số lượng và giá trị của phiếu nhập.</p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
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

      {/* Delete draft */}
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

      {/* Cancel confirmed invoice */}
      <ConfirmDialog
        isOpen={cancelInvoice !== null}
        title="Hủy phiếu nhập kho?"
        message={
          cancelInvoice && (
            <div className="space-y-3 text-sm">
              <p className="text-red-600 font-medium">
                Hành động này sẽ hoàn kho (trừ tồn) và điều chỉnh giảm công nợ NCC. Không thể hủy phiếu nếu đã có phát sinh thanh toán (cần hủy thanh toán trước). Không thể hoàn tác!
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <p><strong>Mã phiếu:</strong> {cancelInvoice.receiptCode}</p>
                <p><strong>Nhà cung cấp:</strong> {cancelInvoice.supplierName}</p>
                <p><strong>Tổng tiền:</strong> {formatVND(cancelInvoice.grandTotal)}</p>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Lý do hủy phiếu *</label>
                <textarea
                  className="form-input w-full resize-none"
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
  )
}
