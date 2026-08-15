import { useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { formatVND } from '@/utils/formatters'
import type { TrendChartPointDTO } from '@shared/ipc-types'

export interface TrendChartSectionProps {
  series: TrendChartPointDTO[]
  groupBy?: string
  dataSource?: string
}

function fmtVNDShort(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}tỷ`
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}tr`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}k`
  return String(value)
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload || !payload.length) return null
  const purchase = payload.find((entry) => entry.name === 'Giá trị nhập')?.value
  const sales = payload.find((entry) => entry.name === 'Giá trị xuất')?.value
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-xl text-xs space-y-1.5 min-w-[160px]">
      <p className="font-semibold text-gray-900 border-b border-gray-100 pb-1">Thời gian: {label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-gray-600">{entry.name}</span>
          </span>
          <span className="font-semibold text-gray-900">{formatVND(entry.value)}</span>
        </div>
      ))}
      {purchase !== undefined && sales !== undefined && (
        <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-1.5">
          <span className="text-gray-600">Chênh lệch</span>
          <span className={`font-semibold ${sales - purchase >= 0 ? 'text-green-700' : 'text-amber-700'}`}>
            {formatVND(sales - purchase)}
          </span>
        </div>
      )}
    </div>
  )
}

export function TrendChartSection({ series, dataSource }: TrendChartSectionProps) {
  const [visibleSeries, setVisibleSeries] = useState({
    revenue: true,
    cogs: true,
    profit: true,
  })

  const chartData = series.map((pt) => ({
    period: pt.period,
    'Doanh thu': pt.salesTotal,
    'Giá vốn': pt.cost,
    'Lợi nhuận': pt.profit,
    'Giá trị nhập': pt.purchaseTotal,
    'Giá trị xuất': pt.cost,
  }))
  const hasEnoughPointsForTrend = chartData.length >= 2

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {dataSource === 'mixed' && (
        <div className="lg:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 shadow-sm font-medium">
          Biểu đồ xu hướng chỉ bao gồm giao dịch InveStock có dữ liệu chi tiết. Dữ liệu lịch sử tổng hợp không được phân bổ giả theo ngày/tháng.
        </div>
      )}
      {!hasEnoughPointsForTrend && chartData.length > 0 && (
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
          Chỉ có một mốc phát sinh trong kỳ. Các điểm dưới đây thể hiện giá trị tại mốc đó, chưa đủ để kết luận xu hướng tăng hoặc giảm.
        </div>
      )}
      {/* Chart A: Revenue - Cost - Profit Trend */}
      <div className="card p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-gray-900">Xu hướng Doanh thu · Giá vốn · Lợi nhuận</h2>
            <div className="flex gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setVisibleSeries((s) => ({ ...s, revenue: !s.revenue }))}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  visibleSeries.revenue ? 'bg-sky-50 border-sky-200 text-sky-700 font-semibold' : 'bg-gray-50 text-gray-400'
                }`}
              >
                Doanh thu
              </button>
              <button
                type="button"
                onClick={() => setVisibleSeries((s) => ({ ...s, cogs: !s.cogs }))}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  visibleSeries.cogs ? 'bg-rose-50 border-rose-200 text-rose-700 font-semibold' : 'bg-gray-50 text-gray-400'
                }`}
              >
                Giá vốn
              </button>
              <button
                type="button"
                onClick={() => setVisibleSeries((s) => ({ ...s, profit: !s.profit }))}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  visibleSeries.profit ? 'bg-green-50 border-green-200 text-green-700 font-semibold' : 'bg-gray-50 text-gray-400'
                }`}
              >
                Lợi nhuận
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-4">Theo dõi biến động và biên lợi nhuận kinh doanh theo thời gian</p>
        </div>

        {chartData.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-xs text-gray-400 border border-dashed rounded-lg">
            Chưa có dữ liệu trong khoảng thời gian này
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="biRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="biCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="biProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={fmtVNDShort} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" iconSize={8} />
              {visibleSeries.revenue && (
                <Area type="monotone" dataKey="Doanh thu" stroke="#0ea5e9" strokeWidth={2} fill="url(#biRevenue)" dot={false} />
              )}
              {visibleSeries.cogs && (
                <Area type="monotone" dataKey="Giá vốn" stroke="#f43f5e" strokeWidth={2} fill="url(#biCost)" dot={false} />
              )}
              {visibleSeries.profit && (
                <Area type="monotone" dataKey="Lợi nhuận" stroke="#22c55e" strokeWidth={2.5} fill="url(#biProfit)" dot={false} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart B: Purchase vs Sales */}
      <div className="card p-4 flex flex-col justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900 mb-0.5">Giá trị nhập kho và xuất kho</h2>
          <p className="text-xs text-gray-500 mb-4">Giá trị nhập là giá vốn hàng mua; giá trị xuất là giá vốn hàng đã xuất, không phải doanh thu</p>
        </div>

        {chartData.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-xs text-gray-400 border border-dashed rounded-lg">
            Chưa có dữ liệu trong khoảng thời gian này
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={fmtVNDShort} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" iconSize={8} />
              <Line type="monotone" dataKey="Giá trị nhập" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="Giá trị xuất" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
