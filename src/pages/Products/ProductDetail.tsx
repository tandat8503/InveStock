import { appCommands } from '@/lib/commands'
import { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { Modal, StatusBadge, LoadingState, ErrorState, EmptyState } from '@/components/ui'
import {
  formatVND,
  formatNumber,
  formatWeight,
  animalCategoryLabels,
  formatDate,
} from '@/utils/formatters'
import type { ProductDTO, InventoryTransactionDTO } from '@shared/ipc-types'
import type { ProductPriceHistoryPoint } from '@shared/ipc-types'
import { Package, TrendingUp, TrendingDown } from 'lucide-react'

export interface ProductDetailProps {
  product: ProductDTO
  isOpen: boolean
  onClose: () => void
}

import { getInventoryTransactionMeta } from '@/utils/transaction'


// Custom tooltip for price history chart
function PriceTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-gray-700">{label}</p>
      <p className="mt-0.5 text-primary-600 font-medium">{formatVND(payload[0].value)}</p>
    </div>
  )
}

export function ProductDetail({ product, isOpen, onClose }: ProductDetailProps) {
  const [history, setHistory] = useState<InventoryTransactionDTO[]>([])
  const [priceHistory, setPriceHistory] = useState<ProductPriceHistoryPoint[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [priceLoading, setPriceLoading] = useState(true)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'transactions' | 'prices'>('transactions')

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const result = await appCommands.inventory.productHistory(product.id, { page: 1, pageSize: 50 })
      if (result.success && result.data) setHistory(result.data)
      else setHistoryError(result.error ?? 'Không tải được lịch sử giao dịch.')
    } catch {
      setHistoryError('Không tải được lịch sử giao dịch.')
    } finally {
      setHistoryLoading(false)
    }
  }, [product.id])

  const loadPriceHistory = useCallback(async () => {
    setPriceLoading(true)
    setPriceError(null)
    try {
      const result = await appCommands.inventory.priceHistory(product.id)
      if (result.success && result.data) setPriceHistory(result.data)
      else setPriceError(result.error ?? 'Không tải được lịch sử giá nhập.')
    } catch {
      setPriceError('Không tải được lịch sử giá nhập.')
    } finally {
      setPriceLoading(false)
    }
  }, [product.id])

  useEffect(() => {
    if (!isOpen) return
    void loadHistory()
    void loadPriceHistory()
  }, [isOpen, loadHistory, loadPriceHistory])

  // Price chart data
  const priceChartData = priceHistory.map((pt) => ({
    date: formatDate(pt.date),
    'Giá nhập': pt.effectiveUnitCost,
    qty: pt.quantity,
    receipt: pt.receiptCode,
  }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Chi tiết sản phẩm" size="xl">
      <div className="space-y-5">
        {/* Basic Info */}
        <div className="rounded-xl bg-gradient-to-br from-gray-50 to-slate-100 border border-gray-200 p-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{product.productName}</h2>
              <p className="mt-0.5 font-mono text-sm text-gray-500">{product.productCode}</p>
            </div>
            <StatusBadge active={product.active} />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg bg-white border border-gray-100 px-3 py-2 shadow-sm">
              <p className="text-xs text-gray-400">Vật nuôi</p>
              <p className="font-semibold text-gray-900 text-sm mt-0.5">
                {animalCategoryLabels[product.animalCategory]}
              </p>
            </div>
            <div className="rounded-lg bg-white border border-gray-100 px-3 py-2 shadow-sm">
              <p className="text-xs text-gray-400">Thương hiệu</p>
              <p className="font-semibold text-gray-900 text-sm mt-0.5">{product.brand || '—'}</p>
            </div>
            <div className="rounded-lg bg-white border border-gray-100 px-3 py-2 shadow-sm">
              <p className="text-xs text-gray-400">Quy cách</p>
              <p className="font-semibold text-gray-900 text-sm mt-0.5">
                {product.packageWeightKnown ? formatWeight(product.packageWeightGrams, product.packageWeightUnit) : 'Chưa thiết lập'}
              </p>
            </div>
            <div className="rounded-lg bg-white border border-gray-100 px-3 py-2 shadow-sm">
              <p className="text-xs text-gray-400">Đơn vị</p>
              <p className="font-semibold text-gray-900 text-sm mt-0.5">{product.inventoryUnit}</p>
            </div>
          </div>
        </div>

        {/* Financial & Stock */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="rounded-full bg-blue-100 p-2.5">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-blue-500">Tồn kho hiện tại</p>
              <p className="text-xl font-bold text-blue-800">
                {formatNumber(product.currentStock)}{' '}
                <span className="text-sm font-normal text-blue-600">{product.inventoryUnit}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4">
            <div className="rounded-full bg-amber-100 p-2.5">
              <TrendingDown className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-amber-500">Giá vốn bình quân</p>
              <p className="text-xl font-bold text-amber-800">{formatVND(product.averageCost)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="rounded-full bg-emerald-100 p-2.5">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-emerald-500">Giá nhập gần nhất</p>
              <p className="text-xl font-bold text-emerald-800">
                {product.latestPurchasePriceKnown ? formatVND(product.latestPurchasePrice) : 'Chưa có giao dịch nhập thực tế'}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 border-b border-gray-200 mb-4">
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'transactions'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Lịch sử giao dịch
            </button>
            <button
              onClick={() => setActiveTab('prices')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'prices'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Biến động giá nhập
            </button>
          </div>

          {/* Tab: Price History Chart */}
          {activeTab === 'prices' && (
            <div>
              {priceLoading ? (
                <LoadingState />
              ) : priceError ? (
                <ErrorState message={priceError} onRetry={() => { void loadPriceHistory() }} />
              ) : priceChartData.length === 0 ? (
                <EmptyState message="Chưa có lịch sử nhập hàng được xác nhận" />
              ) : (
                <>
                  <div className="mb-3 flex items-baseline gap-3">
                    <span className="text-2xl font-bold text-gray-900">
                      {formatVND(priceHistory[priceHistory.length - 1]?.effectiveUnitCost ?? 0)}
                    </span>
                    <span className="text-sm text-gray-400">giá nhập gần nhất</span>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={priceChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        tickFormatter={(v: number) =>
                          v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}tr` : `${(v / 1_000).toFixed(0)}k`
                        }
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<PriceTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="Giá nhập"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        fill="url(#priceGrad)"
                        dot={{ r: 4, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>

                  {/* Price history table */}
                  <div className="mt-4 max-h-40 overflow-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500 font-medium">Ngày nhập</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-medium">Phiếu nhập</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">Số lượng</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">Giá nhập/đơn vị</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {[...priceHistory].reverse().map((pt, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-600">{formatDate(pt.date)}</td>
                            <td className="px-3 py-1.5 font-mono text-gray-500">{pt.receiptCode}</td>
                            <td className="px-3 py-1.5 text-right text-gray-700">{formatNumber(pt.quantity)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-primary-600">
                              {formatVND(pt.effectiveUnitCost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab: Transaction History */}
          {activeTab === 'transactions' && (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              {historyLoading ? (
                <LoadingState />
              ) : historyError ? (
                <ErrorState message={historyError} onRetry={() => { void loadHistory() }} />
              ) : history.length === 0 ? (
                <EmptyState message="Sản phẩm chưa có giao dịch nào" />
              ) : (
                <div className="p-3 bg-white space-y-2">
                  <div className="text-[11px] text-gray-500 italic px-1">
                    Đang hiển thị 50 giao dịch gần nhất
                  </div>
                  <div className="max-h-64 overflow-auto border border-gray-100 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Ngày</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Loại</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Chứng từ</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Số lượng</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Tồn sau GD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {history.map((tx) => {
                          const meta = getInventoryTransactionMeta(tx.transactionType)
                          const quantity = meta.direction === 'in'
                            ? `+${formatNumber(tx.quantityIn)}`
                            : meta.direction === 'out'
                              ? `−${formatNumber(tx.quantityOut)}`
                              : '—'
                          return (
                            <tr key={tx.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-gray-500">{formatDate(tx.transactionDate)}</td>
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${meta.colorClass}`}>
                                  {meta.label}
                                </span>
                              </td>
                              <td className="px-4 py-2 font-mono text-xs text-gray-500">
                                #{tx.sourceId}
                              </td>
                              <td className={`px-4 py-2 text-right font-semibold ${meta.direction === 'in' ? 'text-success-600' : meta.direction === 'out' ? 'text-warning-600' : 'text-gray-500'}`}>
                                {quantity}
                              </td>
                              <td className="px-4 py-2 text-right font-medium text-gray-900">
                                {formatNumber(tx.stockAfter)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
