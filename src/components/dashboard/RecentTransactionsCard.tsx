import { ArrowDownToLine, ArrowUpFromLine, History } from 'lucide-react'
import { formatDate } from '@/utils/formatters'
import type { InventoryTransactionDTO } from '@shared/ipc-types'

export interface RecentTransactionsCardProps {
  transactions: InventoryTransactionDTO[]
  periodLabel?: string
}

import { getInventoryTransactionMeta } from '@/utils/transaction'

export function RecentTransactionsCard({ transactions, periodLabel }: RecentTransactionsCardProps) {
  return (
    <div className="card flex flex-col h-full min-h-0">
      <div className="flex-none flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <History size={16} className="text-gray-500" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">Giao dịch gần nhất trong kỳ</h2>
          {periodLabel && <p className="text-[10px] text-gray-400">{periodLabel}</p>}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100 flex flex-col">
        {transactions.length === 0 ? (
          <div className="flex-1 min-h-[160px] flex items-center justify-center p-6 text-center text-xs text-gray-400">
            Chưa có giao dịch kho gần đây.
          </div>
        ) : (
          transactions.map((tx) => {
            const meta = getInventoryTransactionMeta(tx.transactionType)
            const isIn = meta.direction === 'in'
            const isNeutral = meta.direction === 'neutral'
            return (
              <div
                key={tx.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/80 transition-colors flex-shrink-0 min-h-[56px]"
              >
                <div
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border ${
                    isNeutral
                      ? 'bg-slate-50 border-slate-200 text-slate-600'
                      : isIn
                      ? 'bg-green-50 border-green-200 text-green-600'
                      : 'bg-rose-50 border-rose-200 text-rose-600'
                  }`}
                >
                  {isNeutral ? (
                    <History size={13} />
                  ) : isIn ? (
                    <ArrowDownToLine size={13} />
                  ) : (
                    <ArrowUpFromLine size={13} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-gray-900">{tx.productName}</p>
                  <p className="text-[11px] text-gray-400">
                    {meta.label}
                    {' · '}
                    {formatDate(tx.transactionDate)}
                  </p>
                </div>

                <div className="flex-shrink-0 text-right">
                  {tx.quantityIn > 0 && (
                    <span className="text-xs font-bold text-green-600">+{tx.quantityIn}</span>
                  )}
                  {tx.quantityOut > 0 && (
                    <span className="text-xs font-bold text-rose-600">−{tx.quantityOut}</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
