import type { InvoiceStatus } from '@shared/ipc-types'

export function SalesStatusBadge({ status }: { status: InvoiceStatus }) {
  const styles = {
    xac_nhan: 'badge-xac-nhan',
    huy: 'badge-huy',
    nhap: 'badge-nhap',
  }[status] ?? 'badge-nhap'

  const label = status === 'nhap' ? 'Nháp' : status === 'xac_nhan' ? 'Đã xác nhận' : 'Đã hủy'
  return <span className={styles}>{label}</span>
}
