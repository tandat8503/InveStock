import { useState } from 'react'
import { AlertTriangle, ShieldAlert, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { StockAlertProductDTO } from '@shared/ipc-types'

export interface StockAlertCardProps {
  alerts: StockAlertProductDTO[]
  negativeStockPreview?: StockAlertProductDTO[]
  outOfStockPreview?: StockAlertProductDTO[]
  lowStockPreview?: StockAlertProductDTO[]
  allStockAlertsPreview?: StockAlertProductDTO[]
  negativeStockCount: number
  outOfStockCount: number
  lowStockCount: number
}

export function StockAlertCard({
  alerts,
  negativeStockPreview = [],
  outOfStockPreview = [],
  lowStockPreview = [],
  allStockAlertsPreview = [],
  negativeStockCount,
  outOfStockCount,
  lowStockCount,
}: StockAlertCardProps) {
  const [tab, setTab] = useState<'all' | 'negative' | 'out' | 'low'>('all')

  const allList = allStockAlertsPreview.length > 0 ? allStockAlertsPreview : alerts
  const totalCount = negativeStockCount + outOfStockCount + lowStockCount

  const filtered =
    tab === 'negative'
      ? negativeStockPreview
      : tab === 'out'
      ? outOfStockPreview
      : tab === 'low'
      ? lowStockPreview
      : allList

  const currentCategoryCount =
    tab === 'negative'
      ? negativeStockCount
      : tab === 'out'
      ? outOfStockCount
      : tab === 'low'
      ? lowStockCount
      : totalCount

  const isTruncated = filtered.length >= 15 && currentCategoryCount > filtered.length

  return (
    <div className="card flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-amber-500" />
            <h2 className="text-sm font-bold text-gray-900">Cảnh báo tồn kho</h2>
          </div>
          <Link
            to="/inventory"
            className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors"
          >
            <span>Xem tất cả</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Tab Selection */}
        <div className="flex gap-1.5 px-4 pt-3 text-[11px] font-medium border-b border-gray-100 pb-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`rounded-md px-2 py-1 transition-colors whitespace-nowrap ${
              tab === 'all'
                ? 'bg-gray-900 text-white font-semibold'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Tất cả ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('negative')}
            className={`rounded-md px-2 py-1 transition-colors whitespace-nowrap ${
              tab === 'negative'
                ? 'bg-purple-600 text-white font-semibold'
                : 'text-gray-500 hover:bg-purple-50 hover:text-purple-600'
            }`}
          >
            Tồn âm ({negativeStockCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('out')}
            className={`rounded-md px-2 py-1 transition-colors whitespace-nowrap ${
              tab === 'out'
                ? 'bg-red-500 text-white font-semibold'
                : 'text-gray-500 hover:bg-red-50 hover:text-red-600'
            }`}
          >
            Hết hàng ({outOfStockCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('low')}
            className={`rounded-md px-2 py-1 transition-colors whitespace-nowrap ${
              tab === 'low'
                ? 'bg-amber-500 text-white font-semibold'
                : 'text-gray-500 hover:bg-amber-50 hover:text-amber-600'
            }`}
          >
            Sắp hết ({lowStockCount})
          </button>
        </div>

        <div className="max-h-60 overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-400">
              ✓ Không có sản phẩm nào thuộc diện cảnh báo
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50/70 text-gray-500 font-medium">
                <tr>
                  <th className="px-4 py-2 text-left">Mã</th>
                  <th className="px-4 py-2 text-left">Tên sản phẩm</th>
                  <th className="px-4 py-2 text-right">Tồn hiện tại</th>
                  <th className="px-4 py-2 text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => {
                  const isOut = item.status === 'out_of_stock'
                  const isNegative = item.status === 'negative_stock'
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-2 font-mono text-gray-500">{item.productCode}</td>
                      <td
                        className="px-4 py-2 text-gray-900 font-medium truncate max-w-[130px]"
                        title={item.productName}
                      >
                        {item.productName}
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-gray-900">
                        {item.currentStock}{' '}
                        <span className="text-[10px] font-normal text-gray-400">
                          {item.inventoryUnit}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {isNegative ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 font-semibold text-purple-700 text-[10px]">
                            <AlertTriangle size={10} /> Tồn âm – đối soát
                          </span>
                        ) : isOut ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 font-semibold text-red-600 text-[10px]">
                            <AlertTriangle size={10} /> Hết hàng
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 font-semibold text-amber-700 text-[10px]">
                            Dưới ngưỡng ({item.minThreshold})
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {isTruncated && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-1.5 text-center text-[11px] text-gray-500">
          Hiển thị tối đa 15 sản phẩm. (Tổng số: {currentCategoryCount})
        </div>
      )}
    </div>
  )
}
