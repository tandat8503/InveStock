import type { InvoiceStatus, PurchasePaymentStatus } from '@shared/ipc-types'

export function PurchaseStatusBadge({ status }: { status: InvoiceStatus }) {
  const styles = {
    xac_nhan: 'badge-xac-nhan',
    huy: 'badge-huy',
    nhap: 'badge-nhap',
  }[status] ?? 'badge-nhap'

  const label = status === 'xac_nhan' ? 'Đã xác nhận' : status === 'huy' ? 'Đã hủy' : 'Nháp'
  return <span className={styles}>{label}</span>
}

export function PaymentStatusBadge({ status }: { status: PurchasePaymentStatus }) {
  const label = status === 'da_thanh_toan'
    ? 'Đã thanh toán'
    : status === 'thanh_toan_mot_phan'
      ? 'Một phần'
      : 'Chưa thanh toán'
  return <span className="whitespace-nowrap text-xs text-slate-600">{label}</span>
}
