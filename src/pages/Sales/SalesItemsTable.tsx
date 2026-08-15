import type { SalesInvoiceItemDTO } from '@shared/ipc-types'
import { formatVND } from '@/utils/formatters'

export function SalesItemsTable({ items }: { items: SalesInvoiceItemDTO[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {['Mã', 'Sản phẩm', 'Số lượng', 'Tổng giá xuất', 'Giá vốn'].map((x) => (
              <th key={x} className="px-3 py-2 text-left text-gray-500 font-medium">{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const hasCost = item.lineCost > 0;
            return (
              <tr key={item.id} className="border-t">
                <td className="px-3 py-2 font-mono">{item.productCode}</td>
                <td className="px-3 py-2">{item.productName}</td>
                <td className="px-3 py-2">
                  {item.quantity} {item.inventoryUnit}
                </td>
                <td className="px-3 py-2 font-medium">{formatVND(item.lineRevenue)}</td>
                <td className="px-3 py-2">
                  {hasCost ? formatVND(item.lineCost) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
