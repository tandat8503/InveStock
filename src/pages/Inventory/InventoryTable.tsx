import type { InventorySummaryDTO, CurrentInventoryRowDTO } from '@shared/ipc-types'
import { formatVND } from '@/utils/formatters'

export function InventoryTable({
  rows,
  viewMode,
  onOpen,
  lowStockThreshold,
}: {
  rows: (InventorySummaryDTO | CurrentInventoryRowDTO)[]
  viewMode: 'current' | 'historical'
  onOpen: (id: number) => void
  lowStockThreshold: number
}) {
  const isCurrent = viewMode === 'current'
  
  const headers = isCurrent
    ? ['Mã', 'Sản phẩm', 'Loại', 'Đơn vị', 'Tồn hiện tại', 'Trạng thái', 'Giá vốn BQ', 'Giá trị tồn']
    : ['Mã', 'Sản phẩm', 'Đơn vị', 'Tồn đầu', 'Nhập', 'Xuất', 'Điều chỉnh', 'Tồn cuối', 'Giá vốn BQ', 'Giá trị tồn']

  const numericHeaders = new Set(['Tồn hiện tại', 'Tồn đầu', 'Nhập', 'Xuất', 'Điều chỉnh', 'Tồn cuối', 'Giá vốn BQ', 'Giá trị tồn'])

  return (
    <div className="h-full overflow-auto rounded-xl border border-slate-200">
      <table className="min-w-[1100px] w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[100px]" />
          <col />
          {isCurrent && <col className="w-[90px]" />}
          <col className="w-[80px]" />
          {!isCurrent && (
            <>
              <col className="w-[90px]" />
              <col className="w-[85px]" />
              <col className="w-[85px]" />
              <col className="w-[100px]" />
            </>
          )}
          <col className="w-[95px]" />
          <col className="w-[145px]" />
          <col className="w-[130px]" />
          <col className="w-[145px]" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className={`whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide ${
                  numericHeaders.has(header) ? 'text-right' : 'text-left'
                }`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const stock = isCurrent ? (row as CurrentInventoryRowDTO).currentStock : (row as InventorySummaryDTO).closingStock
            const value = isCurrent ? (row as CurrentInventoryRowDTO).currentInventoryValue : (row as InventorySummaryDTO).stockValue
            const costStatus = isCurrent ? (row as CurrentInventoryRowDTO).costDataStatus : 'known'
            
            const isNegative = stock < 0
            const isOut = stock === 0
            const isLow = stock > 0 && stock <= lowStockThreshold

            return (
              <tr
                key={row.productId}
                className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${isOut ? 'bg-rose-50/40' : isLow ? 'bg-amber-50/40' : ''}`}
                onClick={() => onOpen(row.productId)}
              >
                <td className="whitespace-nowrap px-3 py-2.5 font-medium">{row.productCode}</td>
                <td className="truncate px-3 py-2.5 font-medium text-slate-900" title={row.productName}>
                  {row.productName}
                </td>
                {isCurrent && <td className="truncate px-3 py-2.5">{row.animalCategory}</td>}
                <td className="whitespace-nowrap px-3 py-2.5">{row.inventoryUnit}</td>
                
                {!isCurrent && (
                  <>
                    <td className="px-3 py-2.5 text-right tabular-nums">{(row as InventorySummaryDTO).openingStock}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{(row as InventorySummaryDTO).totalIn}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{(row as InventorySummaryDTO).totalOut}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {(row as InventorySummaryDTO).adjustmentQuantity > 0 ? '+' : ''}
                      {(row as InventorySummaryDTO).adjustmentQuantity}
                    </td>
                  </>
                )}

                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{stock}</td>
                <td className="px-3">
                  {isNegative ? (
                    <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                      Tồn âm – cần đối soát
                    </span>
                  ) : isOut ? (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      Hết hàng
                    </span>
                  ) : isLow ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      Sắp hết (≤{lowStockThreshold})
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      An toàn
                    </span>
                  )}
                </td>
                <td
                  className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"
                  title={costStatus === 'known' ? undefined : 'Dữ liệu giá vốn của sản phẩm này chưa được xác định hoặc cần đối soát.'}
                >
                  {costStatus === 'known' ? formatVND(row.averageCost) : '—'}
                </td>
                <td
                  className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"
                  title={costStatus === 'known' ? undefined : 'Dữ liệu giá vốn của sản phẩm này chưa được xác định hoặc cần đối soát.'}
                >
                  {costStatus === 'known' ? formatVND(value) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
