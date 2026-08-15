import type { InvoiceStatus } from '@shared/ipc-types'

export function SalesStatusBadge({ status }: { status: InvoiceStatus }) {
  const label = status === 'nhap' ? 'Nháp' : status === 'xac_nhan' ? 'Đã xác nhận' : 'Đã hủy'
  const style = status === 'nhap' ? 'bg-amber-100 text-amber-700' : status === 'xac_nhan' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${style}`}>{label}</span>
}
