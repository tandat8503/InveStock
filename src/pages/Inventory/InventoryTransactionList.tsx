import type { InventoryTransactionDTO } from '@shared/ipc-types'
import { getInventoryTransactionMeta } from '@/utils/transaction'
import { formatDate, formatNumber, formatVND } from '@/utils/formatters'

export function InventoryTransactionList({
  transactions,
  onSource,
}: {
  transactions: InventoryTransactionDTO[]
  onSource: (tx: InventoryTransactionDTO) => void
}) {
  const getSourceLabel = (sourceType: string) => {
    switch (sourceType) {
      case 'purchase_invoice':
        return 'Hóa đơn nhập'
      case 'sales_invoice':
        return 'Hóa đơn bán'
      case 'inventory_adjustment':
        return 'Phiếu cân kho'
      case 'legacy_excel':
        return 'Số dư Excel'
      default:
        return sourceType
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="text-[11px] text-gray-500 italic px-1">
        Đang hiển thị 50 giao dịch gần nhất
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {['Ngày', 'Loại', 'Nguồn', 'Nhập', 'Xuất', 'Tồn sau', 'Đơn giá vốn'].map((x) => (
                <th
                  key={x}
                  className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {transactions.map((tx) => {
              const meta = getInventoryTransactionMeta(tx.transactionType)
              const isClickable =
                tx.sourceType === 'purchase_invoice' || tx.sourceType === 'sales_invoice'

              return (
                <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-3 py-2.5 text-gray-500 text-xs">
                    {formatDate(tx.transactionDate)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${meta.colorClass}`}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {isClickable ? (
                      <button
                        className="text-primary-600 hover:text-primary-700 hover:underline text-xs font-semibold text-left"
                        onClick={() => onSource(tx)}
                      >
                        {getSourceLabel(tx.sourceType)} #{tx.sourceId}
                      </button>
                    ) : (
                      <span className="text-gray-500 text-xs font-mono">
                        {getSourceLabel(tx.sourceType)} #{tx.sourceId}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-900 font-semibold">
                    {tx.quantityIn > 0 ? `+${formatNumber(tx.quantityIn)}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-900 font-semibold">
                    {tx.quantityOut > 0 ? `-${formatNumber(tx.quantityOut)}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-900 font-medium">
                    {formatNumber(tx.stockAfter)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-900 font-semibold">
                    {formatVND(tx.unitCost)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
