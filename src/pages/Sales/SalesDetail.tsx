import { appCommands } from '@/lib/commands'
import { useEffect, useState, useCallback } from 'react'
import { ErrorState, LoadingState, Modal } from '@/components/ui'
import type { SalesInvoiceDTO } from '@shared/ipc-types'
import { SalesItemsTable } from './SalesItemsTable'
import { SalesStatusBadge } from './SalesStatusBadge'
import { formatVND } from '@/utils/formatters'

export function SalesDetail({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [sale, setSale] = useState<SalesInvoiceDTO | null>(null)
  const [error, setError] = useState('')
  
  const load = useCallback(async () => {
    if (!id) return
    setError('')
    const result = await appCommands.sales.get(id)
    if (result.success && result.data) setSale(result.data)
    else setError(result.error ?? 'Không tải được phiếu xuất')
  }, [id])

  useEffect(() => {
    setSale(null)
    void load()
  }, [id, load])

  return <Modal isOpen={id !== null} onClose={onClose} title="Chi tiết phiếu xuất" size="xl">
    {error ? <ErrorState message={error} onRetry={() => void load()} /> : !sale ? <LoadingState /> : <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <p>Mã phiếu<br /><strong>{sale.issueCode}</strong></p><p>Số HĐ<br />{sale.electronicInvoiceNumber ?? '—'}</p>
        <p>Người mua<br />{sale.buyerName ?? 'Khách lẻ'}</p><p><SalesStatusBadge status={sale.status} /></p>
      </div>
      <SalesItemsTable items={sale.items} />
      <div className="text-right text-sm border-t pt-3 space-y-1">
        <p className="text-gray-600">Tổng giá xuất: <strong className="text-gray-900 text-base">{formatVND(sale.grandTotal)}</strong></p>
        <p className="text-gray-600">Giá vốn: <span className="text-gray-900 font-semibold">{sale.status === 'nhap' ? '—' : formatVND(sale.totalCost)}</span></p>
      </div>
      {sale.status === 'xac_nhan' && sale.totalCost === 0 && (
        <p className="text-sm text-amber-600 font-medium">Cảnh báo: phiếu xuất đã xác nhận nhưng chưa ghi nhận giá vốn dòng.</p>
      )}
      <div className="text-sm text-gray-500 border-t pt-3">Tạo: {sale.createdAt}{sale.confirmedAt && ` · Xác nhận: ${sale.confirmedAt}`}{sale.cancelledAt && ` · Hủy: ${sale.cancelledAt}`}<br />{sale.cancellationReason && `Lý do: ${sale.cancellationReason}`}</div>
    </div>}
  </Modal>
}
