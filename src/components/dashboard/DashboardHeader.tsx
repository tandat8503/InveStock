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
  day: 'Theo ngày',
  week: 'Theo tuần',
  month: 'Theo tháng',
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
    <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Phân tích kinh doanh</h1>
          <p className="text-xs text-gray-500 mt-0.5">Biểu đồ xu hướng và hiệu suất kho hàng</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPresetDropdown((open) => !open)}
              className="flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <Calendar size={14} className="text-primary-600" />
              <span>{presetLabels[params.preset ?? 'this_month']}</span>
              <ChevronDown size={13} className="text-gray-400" />
            </button>

            {showPresetDropdown && (
              <div className="absolute right-0 z-20 mt-1.5 w-52 space-y-0.5 rounded-xl border border-gray-200 bg-white p-1.5 text-xs shadow-xl">
                {(Object.keys(presetLabels) as DatePreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`w-full rounded-lg px-3 py-2 text-left font-medium transition-colors ${
                      params.preset === preset
                        ? 'bg-primary-50 font-semibold text-primary-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {presetLabels[preset]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Group By Selector */}
          <div className="flex items-center rounded-lg border border-gray-300 bg-gray-50/50 p-0.5 text-xs font-medium">
            <Layers size={13} className="ml-2 mr-1 text-gray-400" />
            {(['day', 'week', 'month'] as GroupByPeriod[]).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => onChange({ ...params, groupBy: period })}
                className={`rounded-md px-2.5 py-1 transition-all ${
                  (params.groupBy ?? 'month') === period
                    ? 'bg-white text-gray-900 font-semibold shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {groupByLabels[period]}
              </button>
            ))}
          </div>

          {/* Compare Toggle */}
          <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 h-9 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={params.comparePrevious ?? true}
              onChange={(e) => onChange({ ...params, comparePrevious: e.target.checked })}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            So với kỳ trước
          </label>

          {/* Refresh Button */}
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading} className="h-9">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </Button>
          <Button size="sm" onClick={handleApply} disabled={loading} className="h-9">Áp dụng</Button>
        </div>
      </div>

      {/* Custom Date Range Picker Inputs (Only visible when 'custom' is selected) */}
      {isCustom && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
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
          {dateError && <p className="self-end pb-2 text-xs text-danger-600">{dateError}</p>}
        </div>
      )}
    </div>
  )
}
