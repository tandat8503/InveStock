import type { InvoiceStatus, PurchasePaymentStatus } from '@shared/ipc-types'

export function PurchaseStatusBadge({ status }: { status: InvoiceStatus }) {
  const styles = status === 'xac_nhan' ? 'bg-green-100 text-green-700' : status === 'huy' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
  const label = status === 'xac_nhan' ? 'Đã xác nhận' : status === 'huy' ? 'Đã hủy' : 'Nháp'
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${styles}`}>{label}</span>
}

export function PaymentStatusBadge({ status }: { status: PurchasePaymentStatus }) {
  const label = status === 'da_thanh_toan' ? 'Đã thanh toán' : status === 'thanh_toan_mot_phan' ? 'Một phần' : 'Chưa thanh toán'
  return <span className="whitespace-nowrap text-xs text-gray-600">{label}</span>
}
