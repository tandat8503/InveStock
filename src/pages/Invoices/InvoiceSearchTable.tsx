import type { InvoiceSearchRow } from '@shared/ipc-types'
import { Button } from '@/components/ui'
import { formatVND } from '@/utils/formatters'
import { InvoiceTypeBadge } from './InvoiceTypeBadge'
import { InvoiceStatusBadge } from './InvoiceStatusBadge'

export function InvoiceSearchTable({ rows, onOpen }: { rows: InvoiceSearchRow[]; onOpen: (row: InvoiceSearchRow) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
          <tr>
            {['Loại', 'Mã phiếu', 'Số hóa đơn', 'Ngày', 'Đối tác / Người mua', 'Mặt hàng', 'Tổng tiền', 'Trạng thái', ''].map((x) => (
              <th key={x} className="px-3 py-3 text-left">
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            return (
              <tr key={`${row.invoiceType}-${row.id}`} className="hover:bg-gray-50/50">
                <td className="px-3 py-3"><InvoiceTypeBadge type={row.invoiceType} /></td>
                <td className="px-3 font-medium text-gray-900 font-mono text-xs">{row.documentCode}</td>
                <td className="px-3 text-gray-600 font-mono text-xs">{row.invoiceNumber ?? '—'}</td>
                <td className="px-3 text-gray-600">{row.invoiceDate}</td>
                <td className="px-3 font-medium text-gray-900">{row.partnerName}</td>
                <td className="px-3 text-gray-600">{row.itemCount} sản phẩm</td>
                <td className="px-3 font-semibold text-gray-900">{formatVND(row.grandTotal)}</td>
                <td className="px-3"><InvoiceStatusBadge status={row.status} /></td>
                <td className="px-3"><Button size="sm" variant="secondary" onClick={() => onOpen(row)}>Xem</Button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

