import { useState } from 'react'
import { appCommands } from '@/lib/commands'
import type { ImportExportReportRow, PeriodResponse, ProductSalesReportRow, ReportParams, ReportDataRange } from '@shared/ipc-types'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui'
import { ReportDateFilter } from './ReportDateFilter'
import { formatDate, formatVND } from '@/utils/formatters'
import { useNotify } from '@/stores/uiStore'

export function ProductSalesReport({ initial, range }: { initial: ReportParams; range?: ReportDataRange | null }) {
  const [filters, setFilters] = useState(initial)
  const [rows, setRows] = useState<ProductSalesReportRow[] | null>(null)
  const [period, setPeriod] = useState<PeriodResponse<ImportExportReportRow> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const notify = useNotify()
  const load = async () => {
    setLoading(true)
    const coverage = await appCommands.reports.importExport(filters)
    if (!coverage.data) { setError(coverage.error ?? 'Không xác định được phạm vi dữ liệu'); setLoading(false); return }
    setPeriod(coverage.data)
    if (coverage.data.dataSource === 'legacy' && !coverage.data.hasRevenueData) {
      setRows(null); setError(''); setLoading(false)
      notify.success(`Đã áp dụng bộ lọc ${formatDate(coverage.data.resolvedDateFrom)} – ${formatDate(coverage.data.resolvedDateTo)}`)
      return
    }
    const result = await appCommands.reports.productSales(filters)
    setRows(result.data ?? null); setError(result.data ? '' : result.error ?? 'Không tải được báo cáo sản phẩm'); setLoading(false)
    if (result.data) notify.success(`Đã áp dụng bộ lọc ${formatDate(coverage.data.resolvedDateFrom)} – ${formatDate(coverage.data.resolvedDateTo)}`)
  }
  const legacyRows = period?.dataSource === 'legacy' && !period.hasRevenueData ? period.rows.filter((row) => row.totalSaleQty !== 0) : null
  return <div className="space-y-4">
    <ReportDateFilter value={filters} onChange={setFilters} onApply={() => void load()} earliestDataDate={range?.earliestDataDate || period?.earliestDataDate} latestDataDate={range?.latestDataDate || period?.latestDataDate} />
    {period && (
      <div className="space-y-2">
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <strong>Đang xem:</strong> {formatDate(period.resolvedDateFrom)} – {formatDate(period.resolvedDateTo)}
        </div>
        {period.dataSource === 'mixed' && period.revenueCoverage === 'partial' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Doanh thu theo sản phẩm chỉ bao gồm giao dịch InveStock. Phần dữ liệu lịch sử trước đó chỉ có số lượng xuất và giá vốn.
          </div>
        )}
      </div>
    )}
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : legacyRows ? <>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Dữ liệu lịch sử có số lượng xuất và giá vốn nhưng không có giá bán. Doanh thu và lợi nhuận không thể xác định.</div>
      <table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Mã</th><th className="p-2 text-left">Sản phẩm</th><th className="p-2 text-right">Số lượng xuất</th><th className="p-2 text-right">Giá vốn xuất</th><th className="p-2 text-center">Doanh thu</th><th className="p-2 text-center">Lợi nhuận</th></tr></thead><tbody>{legacyRows.map((row)=><tr key={row.productId} className="border-t"><td className="p-2">{row.productCode}</td><td>{row.productName}</td><td className="text-right">{row.totalSaleQty.toLocaleString('vi-VN')}</td><td className="text-right">{formatVND(row.saleCostValue)}</td><td className="text-center">N/A</td><td className="text-center">N/A</td></tr>)}</tbody></table>
    </> : !rows?.length ? <EmptyState message="Nhấn Áp dụng để xem dữ liệu" /> : <table className="w-full text-sm"><thead><tr>{['Mã','Sản phẩm','Số lượng','Doanh thu','Giá vốn','Lợi nhuận','Số HĐ'].map((label)=><th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{rows.map((row)=><tr key={row.productId} className="border-t"><td className="p-2">{row.productCode}</td><td>{row.productName}</td><td>{row.quantitySold}</td><td>{row.revenue.toLocaleString('vi-VN')}</td><td>{row.cost.toLocaleString('vi-VN')}</td><td>{row.profit.toLocaleString('vi-VN')}</td><td>{row.invoiceCount}</td></tr>)}</tbody></table>}
  </div>
}
