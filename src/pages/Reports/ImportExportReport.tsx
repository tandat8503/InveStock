import { appCommands } from '@/lib/commands'
import { useState } from 'react'
import type { ImportExportReportRow, PeriodResponse, ReportParams, ReportDataRange } from '@shared/ipc-types'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui'
import { formatDate, formatVND, formatNumber } from '@/utils/formatters'
import { ReportDateFilter } from './ReportDateFilter'
import { ArrowDownToLine, ArrowUpFromLine, Package, DollarSign } from 'lucide-react'
import { useNotify } from '@/stores/uiStore'

export function ImportExportReport({ initial, range }: { initial: ReportParams; range?: ReportDataRange | null }) {
  const [f, setF] = useState(initial)
  const [rows, setRows] = useState<ImportExportReportRow[] | null>(null)
  const [period, setPeriod] = useState<PeriodResponse<ImportExportReportRow> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const notify = useNotify()

  const load = async () => {
    setLoading(true)
    const r = await appCommands.reports.importExport(f)
    setLoading(false)
    if (r.data) {
      setRows(r.data.rows)
      setPeriod(r.data)
      setError('')
      notify.success(`Đã áp dụng bộ lọc ${formatDate(r.data.resolvedDateFrom)} – ${formatDate(r.data.resolvedDateTo)}`)
    } else {
      setError(r.error ?? 'Lỗi tải báo cáo nhập xuất tồn')
    }
  }

  // Aggregate totals
  const summary = rows
    ? rows.reduce(
        (acc, row) => ({
          totalOpeningQty: acc.totalOpeningQty + row.openingStock,
          totalOpeningVal: acc.totalOpeningVal + row.openingValue,
          totalImportQty: acc.totalImportQty + row.totalPurchaseQty,
          totalImportVal: acc.totalImportVal + row.purchaseValue,
          totalExportQty: acc.totalExportQty + row.totalSaleQty,
          totalExportVal: acc.totalExportVal + row.saleCostValue,
          totalAdjustmentQty: acc.totalAdjustmentQty + row.adjustmentQuantity,
          totalAdjustmentVal: acc.totalAdjustmentVal + row.adjustmentValue,
          totalClosingQty: acc.totalClosingQty + row.closingStock,
          totalClosingVal: acc.totalClosingVal + row.closingValue,
        }),
        {
          totalOpeningQty: 0,
          totalOpeningVal: 0,
          totalImportQty: 0,
          totalImportVal: 0,
          totalExportQty: 0,
          totalExportVal: 0,
          totalAdjustmentQty: 0,
          totalAdjustmentVal: 0,
          totalClosingQty: 0,
          totalClosingVal: 0,
        }
      )
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <ReportDateFilter value={f} onChange={setF} onApply={() => void load()} earliestDataDate={range?.earliestDataDate || period?.earliestDataDate} latestDataDate={range?.latestDataDate || period?.latestDataDate} />
        
      </div>

      {period && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${period.dataCoverage === 'complete' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <span className="font-semibold">Đang xem: </span>{formatDate(period.resolvedDateFrom)} – {formatDate(period.resolvedDateTo)}
          <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold">{period.dataSource === 'legacy' ? 'Dữ liệu lịch sử' : period.dataSource === 'mixed' ? 'Lịch sử + InveStock' : 'Dữ liệu InveStock'}</span>
          {period.message && <p className="mt-1 text-xs">{period.message}</p>}
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !rows?.length ? (
        <EmptyState message={period?.message ?? 'Nhấn Áp dụng để xem dữ liệu báo cáo nhập xuất tồn'} />
      ) : (
        <>
          {/* Executive Summary Cards for Selected Period / Quarter */}
          {summary && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="text-gray-500 text-xs font-medium">Điều chỉnh</div>
                <p className="mt-1.5 text-lg font-bold text-gray-900">{summary.totalAdjustmentQty > 0 ? '+' : ''}{formatNumber(summary.totalAdjustmentQty)} <span className="text-xs text-gray-400 font-normal">đơn vị</span></p>
                <p className="text-xs text-gray-600 font-medium">{formatVND(summary.totalAdjustmentVal)}</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                  <Package size={15} className="text-blue-500" />
                  Tồn đầu kỳ
                </div>
                <p className="mt-1.5 text-lg font-bold text-gray-900">
                  {formatNumber(summary.totalOpeningQty)} <span className="text-xs text-gray-400 font-normal">đơn vị</span>
                </p>
                <p className="text-xs text-blue-600 font-medium">{formatVND(summary.totalOpeningVal)}</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                  <ArrowDownToLine size={15} className="text-green-500" />
                  Tổng Nhập kỳ này
                </div>
                <p className="mt-1.5 text-lg font-bold text-gray-900">
                  +{formatNumber(summary.totalImportQty)} <span className="text-xs text-gray-400 font-normal">đơn vị</span>
                </p>
                <p className="text-xs text-green-600 font-medium">{formatVND(summary.totalImportVal)}</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                  <ArrowUpFromLine size={15} className="text-amber-500" />
                  Tổng Xuất kỳ này
                </div>
                <p className="mt-1.5 text-lg font-bold text-gray-900">
                  −{formatNumber(summary.totalExportQty)} <span className="text-xs text-gray-400 font-normal">đơn vị</span>
                </p>
                <p className="text-xs text-amber-600 font-medium">{formatVND(summary.totalExportVal)} (giá vốn)</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                  <DollarSign size={15} className="text-emerald-500" />
                  Tồn cuối kỳ
                </div>
                <p className="mt-1.5 text-lg font-bold text-gray-900">
                  {formatNumber(summary.totalClosingQty)} <span className="text-xs text-gray-400 font-normal">đơn vị</span>
                </p>
                <p className="text-xs text-emerald-600 font-bold">{formatVND(summary.totalClosingVal)}</p>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="p-3 text-left">Mã</th>
                  <th className="p-3 text-left">Sản phẩm</th>
                  <th className="p-3 text-right">Tồn đầu</th>
                  <th className="p-3 text-right">Nhập</th>
                  <th className="p-3 text-right">Xuất</th>
                  <th className="p-3 text-right">Điều chỉnh</th>
                  <th className="p-3 text-right">Tồn cuối</th>
                  <th className="p-3 text-right">Giá vốn BQ</th>
                  <th className="p-3 text-right">Giá trị tồn cuối</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((x) => (
                  <tr className="hover:bg-gray-50 transition-colors" key={x.productId}>
                    <td className="p-3 font-mono text-xs text-gray-500">{x.productCode}</td>
                    <td className="p-3 font-medium text-gray-900">{x.productName}</td>
                    <td className="p-3 text-right text-gray-600">{formatNumber(x.openingStock)}</td>
                    <td className="p-3 text-right text-green-600 font-medium">+{formatNumber(x.totalPurchaseQty)}</td>
                    <td className="p-3 text-right text-amber-600 font-medium">−{formatNumber(x.totalSaleQty)}</td>
                    <td className="p-3 text-right text-gray-600 font-medium">{x.adjustmentQuantity > 0 ? '+' : ''}{formatNumber(x.adjustmentQuantity)}</td>
                    <td className="p-3 text-right font-bold text-gray-900">{formatNumber(x.closingStock)}</td>
                    <td className="p-3 text-right text-gray-500">{formatVND(x.closingAverageCost)}</td>
                    <td className="p-3 text-right font-semibold text-emerald-600">
                      {formatVND(x.closingValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
