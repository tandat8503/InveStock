import { useState } from 'react'
import { Calendar, ChevronDown, Filter } from 'lucide-react'
import { Button, DatePicker } from '@/components/ui'
import type { ReportParams } from '@shared/ipc-types'
import { localDateISO } from '@/utils/localDate'

export interface ReportDateFilterProps {
  value: ReportParams
  onChange: (v: ReportParams) => void
  onApply: () => void
  earliestDataDate?: string | null
  latestDataDate?: string | null
}

/** Returns a human-readable label if dateFrom/dateTo matches a known quarter or full year, else null */
const getSelectedPeriodLabel = (dateFrom: string, dateTo: string): string | null => {
  if (!dateFrom || !dateTo) return null
  const yearFrom = dateFrom.slice(0, 4)
  const yearTo = dateTo.slice(0, 4)
  if (yearFrom !== yearTo) return null

  if (dateFrom.endsWith('-01-01') && dateTo.endsWith('-03-31')) return `Quý I · ${yearFrom}`
  if (dateFrom.endsWith('-04-01') && dateTo.endsWith('-06-30')) return `Quý II · ${yearFrom}`
  if (dateFrom.endsWith('-07-01') && dateTo.endsWith('-09-30')) return `Quý III · ${yearFrom}`
  if (dateFrom.endsWith('-10-01') && dateTo.endsWith('-12-31')) return `Quý IV · ${yearFrom}`
  if (dateFrom.endsWith('-01-01') && dateTo.endsWith('-12-31')) return `Cả năm ${yearFrom}`

  return null
}

export function ReportDateFilter({ value, onChange, onApply, earliestDataDate, latestDataDate }: ReportDateFilterProps) {
  const [showQuarterMenu, setShowQuarterMenu] = useState(false)
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const earliestYear = Number(earliestDataDate?.slice(0, 4)) || currentYear
  const latestYear = Math.max(Number(latestDataDate?.slice(0, 4)) || currentYear, currentYear)
  const availableYears = Array.from({ length: latestYear - earliestYear + 1 }, (_, index) => earliestYear + index)

  const selectedPeriodLabel = getSelectedPeriodLabel(value.dateFrom, value.dateTo)

  const applyQuarter = (quarter: 1 | 2 | 3 | 4) => {
    let dateFrom = ''
    let dateTo = ''

    switch (quarter) {
      case 1:
        dateFrom = `${selectedYear}-01-01`
        dateTo = `${selectedYear}-03-31`
        break
      case 2:
        dateFrom = `${selectedYear}-04-01`
        dateTo = `${selectedYear}-06-30`
        break
      case 3:
        dateFrom = `${selectedYear}-07-01`
        dateTo = `${selectedYear}-09-30`
        break
      case 4:
        dateFrom = `${selectedYear}-10-01`
        dateTo = `${selectedYear}-12-31`
        break
    }

    onChange({ ...value, dateFrom, dateTo })
    setShowQuarterMenu(false)
  }

  const applyFullYear = () => {
    onChange({
      ...value,
      dateFrom: `${selectedYear}-01-01`,
      dateTo: `${selectedYear}-12-31`,
    })
    setShowQuarterMenu(false)
  }

  return (
    <div className="flex flex-wrap items-end gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
      <div className="w-40">
        <DatePicker
          label="Từ ngày"
          value={value.dateFrom || ''}
          onChange={(dateFrom) => onChange({ ...value, dateFrom })}
        />
      </div>

      <div className="w-40">
        <DatePicker
          label="Đến ngày"
          value={value.dateTo || ''}
          onChange={(dateTo) => onChange({ ...value, dateTo })}
        />
      </div>

      {/* Quick Quarter Selection Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowQuarterMenu(!showQuarterMenu)}
          className="flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <Calendar size={14} className="text-primary-600" />
          <span>{selectedPeriodLabel ?? 'Chọn theo Quý'}</span>
          <ChevronDown size={13} className="text-gray-400" />
        </button>

        {showQuarterMenu && (
          <div className="absolute left-0 z-20 mt-1 w-56 rounded-xl border border-gray-200 bg-white p-2.5 shadow-xl text-xs space-y-2">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="font-semibold text-gray-700">Chọn năm:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="rounded border border-gray-200 bg-gray-50 px-2 py-1 font-semibold text-gray-900 focus:outline-none"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    Năm {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => applyQuarter(1)}
                className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-left hover:bg-primary-50 hover:border-primary-200 transition-colors"
              >
                <p className="font-bold text-gray-900">Quý I</p>
                <p className="text-[10px] text-gray-400">01/01 – 31/03</p>
              </button>

              <button
                type="button"
                onClick={() => applyQuarter(2)}
                className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-left hover:bg-primary-50 hover:border-primary-200 transition-colors"
              >
                <p className="font-bold text-gray-900">Quý II</p>
                <p className="text-[10px] text-gray-400">01/04 – 30/06</p>
              </button>

              <button
                type="button"
                onClick={() => applyQuarter(3)}
                className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-left hover:bg-primary-50 hover:border-primary-200 transition-colors"
              >
                <p className="font-bold text-gray-900">Quý III</p>
                <p className="text-[10px] text-gray-400">01/07 – 30/09</p>
              </button>

              <button
                type="button"
                onClick={() => applyQuarter(4)}
                className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-left hover:bg-primary-50 hover:border-primary-200 transition-colors"
              >
                <p className="font-bold text-gray-900">Quý IV</p>
                <p className="text-[10px] text-gray-400">01/10 – 31/12</p>
              </button>
            </div>

            <button
              type="button"
              onClick={applyFullYear}
              className="w-full rounded-lg bg-gray-100 py-1.5 text-center font-medium text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Cả năm {selectedYear}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={onApply} className="h-9">
          <Filter size={14} className="mr-1" />
          Áp dụng
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            onChange({ ...value, dateFrom: `${currentYear}-01-01`, dateTo: localDateISO() })
          }}
          className="h-9"
        >
          Đặt lại
        </Button>
      </div>
    </div>
  )
}
