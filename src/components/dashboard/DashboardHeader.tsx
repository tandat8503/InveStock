import { useState } from 'react'
import { Calendar, ChevronDown, RefreshCw, Layers } from 'lucide-react'
import { Button, DatePicker } from '@/components/ui'
import type { DashboardQueryParams, DatePreset, GroupByPeriod } from '@shared/ipc-types'

export interface DashboardHeaderProps {
  params: DashboardQueryParams
  onChange: (newParams: DashboardQueryParams) => void
  onApply: () => void
  onRefresh: () => void
  loading: boolean
}

const presetLabels: Record<DatePreset, string> = {
  today: 'Hôm nay',
  last_7_days: '7 ngày qua',
  last_30_days: '30 ngày qua',
  last_3_months: '3 tháng qua',
  last_6_months: '6 tháng qua',
  last_12_months: '12 tháng qua',
  this_month: 'Tháng này',
  last_month: 'Tháng trước',
  this_quarter: 'Quý này',
  this_year: 'Năm nay',
  custom: 'Tùy chọn',
}

const groupByLabels: Record<GroupByPeriod, string> = {
  day: 'Ngày',
  week: 'Tuần',
  month: 'Tháng',
}

export function DashboardHeader({
  params,
  onChange,
  onApply,
  onRefresh,
  loading,
}: DashboardHeaderProps) {
  const [showPresetDropdown, setShowPresetDropdown] = useState(false)
  const [dateError, setDateError] = useState<string | null>(null)

  const isCustom = params.preset === 'custom'

  const handleSelectPreset = (preset: DatePreset) => {
    const updated: DashboardQueryParams = { ...params, preset }
    if (preset !== 'custom') {
      updated.dateFrom = undefined
      updated.dateTo = undefined
    }
    onChange(updated)
    setShowPresetDropdown(false)
    setDateError(null)
  }

  const handleApply = () => {
    if (isCustom) {
      if (!params.dateFrom || !params.dateTo) {
        setDateError('Vui lòng chọn đầy đủ từ ngày và đến ngày')
        return
      }
      if (params.dateFrom > params.dateTo) {
        setDateError('Ngày bắt đầu không được lớn hơn ngày kết thúc')
        return
      }
    }
    setDateError(null)
    onApply()
  }

  return (
    <div className="card p-4 flex flex-col gap-4 flex-shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Title */}
        <div>
          <h1 className="page-title text-xl">Phân tích kinh doanh</h1>
          <p className="page-subtitle">Biểu đồ xu hướng và hiệu suất kho hàng</p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPresetDropdown((open) => !open)}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <Calendar size={14} className="text-primary-600 flex-shrink-0" />
              <span>{presetLabels[params.preset ?? 'this_month']}</span>
              <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
            </button>

            {showPresetDropdown && (
              <div className="absolute right-0 z-20 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                {(Object.keys(presetLabels) as DatePreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                      params.preset === preset
                        ? 'bg-primary-50 font-semibold text-primary-700'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {presetLabels[preset]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Group By Selector */}
          <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50 p-0.5 text-xs font-medium">
            <Layers size={13} className="ml-2 mr-1 text-slate-400 flex-shrink-0" />
            {(['day', 'week', 'month'] as GroupByPeriod[]).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => onChange({ ...params, groupBy: period })}
                className={`rounded-md px-2.5 py-1 transition-all ${
                  (params.groupBy ?? 'month') === period
                    ? 'bg-white text-slate-900 font-semibold shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {groupByLabels[period]}
              </button>
            ))}
          </div>

          {/* Compare Toggle */}
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <input
              type="checkbox"
              checked={params.comparePrevious ?? true}
              onChange={(e) => onChange({ ...params, comparePrevious: e.target.checked })}
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            So với kỳ trước
          </label>

          {/* Refresh — secondary/ghost */}
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading} className="h-9">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </Button>

          {/* Apply — primary, most prominent */}
          <Button size="sm" onClick={handleApply} disabled={loading} className="h-9">
            Áp dụng
          </Button>
        </div>
      </div>

      {/* Custom Date Range Picker (only when preset = 'custom') */}
      {isCustom && (
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
          <div className="w-40">
            <DatePicker
              label="Từ ngày"
              value={params.dateFrom ?? ''}
              onChange={(dateFrom) => {
                onChange({ ...params, dateFrom })
                setDateError(null)
              }}
            />
          </div>
          <div className="w-40">
            <DatePicker
              label="Đến ngày"
              value={params.dateTo ?? ''}
              onChange={(dateTo) => {
                onChange({ ...params, dateTo })
                setDateError(null)
              }}
            />
          </div>
          {dateError && <p className="self-end pb-2 text-xs text-red-600">{dateError}</p>}
        </div>
      )}
    </div>
  )
}
