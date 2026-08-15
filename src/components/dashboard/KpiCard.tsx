import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatVND } from '@/utils/formatters'
import type { KpiMetricDTO } from '@shared/ipc-types'

export interface KpiCardProps {
  title: string
  metric: KpiMetricDTO | number
  isMoney?: boolean
  subtitle?: string
  context?: string
  favorableWhen?: 'up' | 'down' | 'neutral'
  icon: React.ElementType
  accentColor: 'blue' | 'rose' | 'green' | 'purple' | 'amber' | 'emerald'
}

const colorStyles = {
  blue: { iconBg: 'bg-blue-50 text-blue-600 border-blue-100' },
  rose: { iconBg: 'bg-rose-50 text-rose-600 border-rose-100' },
  green: { iconBg: 'bg-green-50 text-green-600 border-green-100' },
  purple: { iconBg: 'bg-purple-50 text-purple-600 border-purple-100' },
  amber: { iconBg: 'bg-amber-50 text-amber-600 border-amber-100' },
  emerald: { iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
}

export function KpiCard({ title, metric, isMoney = true, subtitle, context, favorableWhen = 'neutral', icon: Icon, accentColor }: KpiCardProps) {
  const isDto = typeof metric === 'object' && metric !== null
  const currentVal = isDto ? metric.current : metric
  const formattedVal = isMoney ? formatVND(currentVal) : currentVal.toLocaleString('vi-VN')

  const changePercent = isDto ? metric.changePercent : null
  const hasPrevious = isDto && metric.previous !== null
  const comparisonUnavailable = hasPrevious && changePercent === null

  let trendIcon = <Minus size={11} className="text-gray-400" />
  let trendClass = 'bg-gray-100 text-gray-600'
  let trendText = 'Không có dữ liệu so sánh'

  if (hasPrevious && changePercent !== null) {
    if (changePercent > 0) {
      trendIcon = <TrendingUp size={11} />
      trendClass = favorableWhen === 'up'
        ? 'bg-green-50 text-green-700 border border-green-200'
        : favorableWhen === 'down'
          ? 'bg-rose-50 text-rose-700 border border-rose-200'
          : 'bg-blue-50 text-blue-700 border border-blue-200'
      trendText = `+${changePercent}% so với kỳ trước`
    } else if (changePercent < 0) {
      trendIcon = <TrendingDown size={11} />
      trendClass = favorableWhen === 'down'
        ? 'bg-green-50 text-green-700 border border-green-200'
        : favorableWhen === 'up'
          ? 'bg-rose-50 text-rose-700 border border-rose-200'
          : 'bg-blue-50 text-blue-700 border border-blue-200'
      trendText = `${changePercent}% so với kỳ trước`
    } else {
      trendText = 'Không đổi so với kỳ trước'
    }
  }

  return (
    <div className="card p-4 flex flex-col justify-between hover:shadow-card-hover transition-all">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider truncate">{title}</p>
          {context && <p className="mt-0.5 text-[10px] font-medium text-gray-400">{context}</p>}
          <p className="mt-1.5 text-2xl font-bold text-gray-900 tracking-tight leading-none truncate">
            {formattedVal}
          </p>
        </div>
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${colorStyles[accentColor].iconBg}`}>
          <Icon size={18} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-gray-100">
        {hasPrevious && !comparisonUnavailable ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-[11px] ${trendClass}`}>
            {trendIcon}
            <span>{trendText}</span>
          </span>
        ) : (
          <span className="text-gray-400 text-[11px]">
            {comparisonUnavailable ? 'Kỳ trước không phát sinh — không tính %' : subtitle || 'Ghi nhận hiện tại'}
          </span>
        )}
      </div>
    </div>
  )
}
