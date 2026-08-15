export function InvoiceTypeBadge({ type }: { type: 'purchase' | 'sale' }) {
  return <span className={`rounded px-2 py-1 text-xs ${type === 'purchase' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{type === 'purchase' ? 'Nhập' : 'Xuất'}</span>
}
