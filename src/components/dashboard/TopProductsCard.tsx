import { useState } from 'react'
import { Award } from 'lucide-react'
import { formatVND, formatNumber } from '@/utils/formatters'
import type { TopProductItemDTO } from '@shared/ipc-types'

export interface TopProductsCardProps {
  topSelling: TopProductItemDTO[]
  topImported: TopProductItemDTO[]
  periodLabel?: string
}

export function TopProductsCard({ topSelling, topImported, periodLabel }: TopProductsCardProps) {
  const [tab, setTab] = useState<'selling' | 'imported'>('selling')

  const items = tab === 'selling' ? topSelling : topImported

  return (
    <div className="card flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Award size={16} className="text-primary-600" />
            <div>
              <h2 className="text-sm font-bold text-gray-900">Top sản phẩm trong kỳ</h2>
              {periodLabel && <p className="text-[10px] text-gray-400">{periodLabel}</p>}
            </div>
          </div>

          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setTab('selling')}
              className={`rounded-md px-2.5 py-1 transition-all ${
                tab === 'selling' ? 'bg-white text-gray-900 font-semibold shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Bán chạy
            </button>
            <button
              type="button"
              onClick={() => setTab('imported')}
              className={`rounded-md px-2.5 py-1 transition-all ${
                tab === 'imported' ? 'bg-white text-gray-900 font-semibold shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Nhập nhiều
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3 max-h-60 overflow-auto">
          {items.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">
              Chưa có dữ liệu trong kỳ phân tích này
            </div>
          ) : (
            items.map((item, idx) => (
              <div key={item.id} className="space-y-1 text-xs">
                <div className="flex items-center justify-between font-medium">
                  <span className="flex items-center gap-2 text-gray-900 truncate max-w-[170px]" title={item.productName}>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 font-bold text-[10px] text-gray-500">
                      {idx + 1}
                    </span>
                    {item.productName}
                  </span>
                  <div className="text-right">
                    <span className="font-bold text-gray-900">{formatVND(item.totalValue)}</span>
                    <span className="ml-1 text-[10px] text-gray-400">
                      ({formatNumber(item.totalQuantity)} {item.inventoryUnit})
                    </span>
                  </div>
                </div>

                {/* Percentage Share Progress Bar */}
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        tab === 'selling' ? 'bg-sky-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${Math.min(item.sharePercent, 100)}%` }}
                    />
                  </div>
                  <span className="w-9 text-right font-mono text-[10px] text-gray-500">
                    {item.sharePercent}%
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
