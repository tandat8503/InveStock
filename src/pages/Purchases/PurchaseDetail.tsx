import { appCommands } from '@/lib/commands'
import { useEffect, useState, useCallback } from 'react'
import { Modal, LoadingState, ErrorState } from '@/components/ui'
import type { PurchaseInvoiceDTO } from '@shared/ipc-types'
import { PurchaseItemsTable } from './PurchaseItemsTable'
import { PurchaseStatusBadge } from './PurchaseStatusBadge'
import { formatVND } from '@/utils/formatters'

export function PurchaseDetail({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [invoice, setInvoice] = useState<PurchaseInvoiceDTO | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setError('')
    try {
      const detail = await appCommands.purchases.get(id)
      if (detail.success && detail.data) {
        setInvoice(detail.data)
      } else {
        setError(detail.error ?? 'Không tải được chi tiết phiếu nhập')
      }
    } catch {
      setError('Lỗi tải chi tiết phiếu nhập')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Modal isOpen={id !== null} onClose={onClose} title="Chi tiết phiếu nhập" size="xl">
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !invoice ? (
        <LoadingState />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <p>
              <span className="text-gray-500">Mã phiếu</span>
              <br />
              <strong className="text-gray-900">{invoice.receiptCode}</strong>
            </p>
            <p>
              <span className="text-gray-500">Số hóa đơn</span>
              <br />
              <strong className="text-gray-900">{invoice.invoiceNumber}</strong>
            </p>
            <p>
              <span className="text-gray-500">Ngày hóa đơn</span>
              <br />
              <strong className="text-gray-900">{invoice.invoiceDate}</strong>
            </p>
            <p>
              <span className="text-gray-500">Ngày nhập</span>
              <br />
              <strong className="text-gray-900">{invoice.receivedDate}</strong>
            </p>
            <p>
              <span className="text-gray-500">Nhà cung cấp</span>
              <br />
              <strong className="text-gray-900">{invoice.supplierName}</strong>
            </p>
            <p>
              <span className="text-gray-500">Trạng thái</span>
              <br />
              <span className="inline-block mt-0.5">
                <PurchaseStatusBadge status={invoice.status} />
              </span>
            </p>
            {invoice.notes && (
              <p className="col-span-2">
                <span className="text-gray-500">Ghi chú</span>
                <br />
                <span className="text-gray-700">{invoice.notes}</span>
              </p>
            )}
          </div>

          <PurchaseItemsTable items={invoice.items} />

          <div className="text-right text-sm border-t pt-3 space-y-1">
            <p className="text-gray-600 font-medium">
              Tổng giá trị phiếu nhập:{' '}
              <strong className="text-primary-700 text-lg">{formatVND(invoice.grandTotal)}</strong>
            </p>
          </div>

          <div className="border-t pt-3">
            <h3 className="font-semibold text-gray-700 mb-1">Lịch sử</h3>
            <ul className="space-y-1 text-xs text-gray-500">
              <li>Tạo: {invoice.createdAt}</li>
              {invoice.confirmedAt && <li>Xác nhận: {invoice.confirmedAt}</li>}
              {invoice.cancelledAt && (
                <li>
                  Hủy: {invoice.cancelledAt}
                  {invoice.cancellationReason && ` (Lý do: ${invoice.cancellationReason})`}
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  )
}
