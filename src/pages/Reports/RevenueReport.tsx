import { useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import { appCommands } from '@/lib/commands'
import type { PeriodResponse, ImportExportReportRow, ReportParams, RevenueSummary, ReportDataRange } from '@shared/ipc-types'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui'
import { ReportDateFilter } from './ReportDateFilter'
import { ReportSummaryCards } from './ReportSummaryCards'
import { formatDate } from '@/utils/formatters'
import { useNotify } from '@/stores/uiStore'

export function RevenueReport({ initial, range }: { initial: ReportParams; range?: ReportDataRange | null }) {
  const [filters, setFilters] = useState(initial)
  const [data, setData] = useState<RevenueSummary | null>(null)
  const [period, setPeriod] = useState<PeriodResponse<ImportExportReportRow> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const notify = useNotify()

  const load = async () => {
    setLoading(true)
    setError('')
    const coverage = await appCommands.reports.importExport(filters)
    if (!coverage.data) {
      setError(coverage.error ?? 'Không xác định được phạm vi dữ liệu')
      setLoading(false)
      return
    }
    setPeriod(coverage.data)
    if (coverage.data.revenueCoverage === 'unavailable') {
      setData(null)
      setLoading(false)
      notify.success(`Đã áp dụng bộ lọc ${formatDate(coverage.data.resolvedDateFrom)} – ${formatDate(coverage.data.resolvedDateTo)}`)
      return
    }
    const result = await appCommands.reports.revenue(filters)
    setData(result.data ?? null)
    setError(result.data ? '' : result.error ?? 'Không tải được báo cáo doanh thu')
    setLoading(false)
    if (result.data) notify.success(`Đã áp dụng bộ lọc ${formatDate(coverage.data.resolvedDateFrom)} – ${formatDate(coverage.data.resolvedDateTo)}`)
  }

  return <div className="space-y-4">
    <ReportDateFilter value={filters} onChange={setFilters} onApply={() => void load()} earliestDataDate={range?.earliestDataDate || period?.earliestDataDate} latestDataDate={range?.latestDataDate || period?.latestDataDate} />
    {period && <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"><strong>Đang xem:</strong> {formatDate(period.resolvedDateFrom)} – {formatDate(period.resolvedDateTo)}{period.revenueCoverage === 'partial' && <p className="mt-1 text-xs text-amber-800">Một phần dữ liệu: doanh thu chỉ gồm giao dịch InveStock, không bao gồm phần lịch sử thiếu giá bán.</p>}</div>}
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : period?.revenueCoverage === 'unavailable' ? (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Dữ liệu lịch sử của kỳ này không có giá bán nên không thể xác định doanh thu và lợi nhuận.</div>
    ) : !data ? <EmptyState message="Nhấn Áp dụng để xem dữ liệu" /> : <>
      <ReportSummaryCards values={[{ label: 'Doanh thu', value: data.totalRevenue, money: true }, { label: 'Giá vốn', value: data.totalCost, money: true }, { label: 'Lợi nhuận', value: data.totalProfit, money: true }, { label: 'Hóa đơn', value: data.invoiceCount }]} />
      <div className="h-72"><ResponsiveContainer><LineChart data={data.chart}><XAxis dataKey="period" /><YAxis /><Tooltip formatter={(value: number) => value.toLocaleString('vi-VN')} /><Legend /><Line dataKey="revenue" stroke="#2563eb" /><Line dataKey="cost" stroke="#64748b" /><Line dataKey="profit" stroke="#16a34a" /></LineChart></ResponsiveContainer></div>
    </>}
  </div>
}
