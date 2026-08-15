import type { PurchaseInvoiceItemDTO } from '@shared/ipc-types'
import { formatVND } from '@/utils/formatters'

export function PurchaseItemsTable({ items }: { items: PurchaseInvoiceItemDTO[] }) {
  const hasLegacyDetails = items.some(
    (item) => item.discountAmount > 0 || item.shippingAllocation > 0
  )

  if (!hasLegacyDetails) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Mã</th>
              <th className="px-3 py-2 text-left font-semibold">Sản phẩm</th>
              <th className="px-3 py-2 text-right font-semibold">Số lượng</th>
              <th className="px-3 py-2 text-right font-semibold">Tổng giá trị nhập</th>
              <th className="px-3 py-2 text-right font-semibold">Đơn giá ước tính</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2 font-mono text-xs">{item.productCode}</td>
                <td className="px-3 py-2 font-medium text-gray-900">{item.productName}</td>
                <td className="px-3 py-2 text-right">
                  {item.quantity} {item.inventoryUnit}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-gray-900">
                  {formatVND(item.lineTotal)}
                </td>
                <td className="px-3 py-2 text-right text-gray-600">
                  ≈ {formatVND(item.effectiveUnitCost)} / {item.inventoryUnit ?? 'đơn vị'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Mã</th>
            <th className="px-3 py-2 text-left font-semibold">Sản phẩm</th>
            <th className="px-3 py-2 text-right font-semibold">SL</th>
            <th className="px-3 py-2 text-right font-semibold">Giá HĐ</th>
            <th className="px-3 py-2 text-right font-semibold">Chiết khấu</th>
            <th className="px-3 py-2 text-right font-semibold">Giá thực nhập</th>
            <th className="px-3 py-2 text-right font-semibold">Tổng dòng</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-2 font-mono text-xs">{item.productCode}</td>
              <td className="px-3 py-2 font-medium text-gray-900">{item.productName}</td>
              <td className="px-3 py-2 text-right">
                {item.quantity} {item.inventoryUnit}
              </td>
              <td className="px-3 py-2 text-right">{formatVND(item.invoiceUnitPrice)}</td>
              <td className="px-3 py-2 text-right">{formatVND(item.discountAmount)}</td>
              <td className="px-3 py-2 text-right">{formatVND(item.effectiveUnitCost)}</td>
              <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatVND(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

