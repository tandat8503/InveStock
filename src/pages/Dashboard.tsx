import { useEffect, useState, useCallback, useRef } from 'react'
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  ArrowDownToLine,
  Package,
  CalendarRange,
  Clock3,
} from 'lucide-react'
import type { DashboardAnalyticsDTO, DashboardQueryParams } from '@shared/ipc-types'
import { LoadingState, ErrorState } from '@/components/ui'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { TrendChartSection } from '@/components/dashboard/TrendChartSection'
import { StockAlertCard } from '@/components/dashboard/StockAlertCard'
import { TopProductsCard } from '@/components/dashboard/TopProductsCard'
import { RecentTransactionsCard } from '@/components/dashboard/RecentTransactionsCard'
import { InsightPanel } from '@/components/dashboard/InsightPanel'
import { appCommands } from '@/lib/commands'
import { useUIStore } from '@/stores/uiStore'
import { formatDate, formatVND } from '@/utils/formatters'

export function Dashboard() {
  const initialParams: DashboardQueryParams = {
    preset: 'last_30_days',
    groupBy: 'day',
    comparePrevious: true,
  }
  const [draftParams, setDraftParams] = useState<DashboardQueryParams>(initialParams)
  const [appliedParams, setAppliedParams] = useState<DashboardQueryParams>(initialParams)

  const [data, setData] = useState<DashboardAnalyticsDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pendingFeedback = useRef(false)
  const addNotification = useUIStore((state) => state.addNotification)

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await appCommands.dashboard.analytics(appliedParams)
      if (res.success && res.data) {
        setData(res.data)
        if (pendingFeedback.current) {
          addNotification({ type: 'success', message: `Đã áp dụng Dashboard: ${formatDate(res.data.resolvedDateFrom)} – ${formatDate(res.data.resolvedDateTo)}` })
          pendingFeedback.current = false
        }
      } else {
        setError(res.error ?? 'Không thể tải dữ liệu phân tích dashboard')
      }
    } catch {
      setError('Lỗi kết nối hệ thống')
    } finally {
      setLoading(false)
    }
  }, [appliedParams, addNotification])

  useEffect(() => {
    void fetchAnalytics()
  }, [fetchAnalytics])

  return (
    <div className="flex flex-col gap-5 p-5 overflow-auto h-full bg-slate-50">
      {/* 1. Header with Filters & Controls */}
      <DashboardHeader
        params={draftParams}
        onChange={setDraftParams}
        onApply={() => { pendingFeedback.current = true; setAppliedParams({ ...draftParams }) }}
        onRefresh={() => void fetchAnalytics()}
        loading={loading}
      />

      {data && (
        <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 md:grid-cols-2">
          <div className="flex items-start gap-2.5">
            <CalendarRange size={16} className="mt-0.5 shrink-0 text-primary-600" />
            <div>
              <p className="font-semibold text-slate-900">Kỳ phân tích giao dịch</p>
              <p className="text-xs text-slate-500">
                {formatDate(data.resolvedDateFrom)} – {formatDate(data.resolvedDateTo)} · {appliedParams.groupBy === 'month' ? 'Theo tháng' : appliedParams.groupBy === 'week' ? 'Theo tuần' : 'Theo ngày'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 border-slate-200 md:border-l md:pl-4">
            <Clock3 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-slate-900">Snapshot tồn kho tại {formatDate(data.snapshotAsOf)}</p>
              <p className="text-xs text-slate-500">Bao gồm số dư Q2 chuyển sang và mọi giao dịch phát sinh sau đó; không thay đổi theo bộ lọc kỳ.</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void fetchAnalytics()} />
      ) : !data ? null : (
        <>
          {/* 2. KPI Cards Row */}
          {data.message && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{data.message}{data.revenueCoverage === 'partial' && <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold">Một phần dữ liệu</span>}</div>}
          {data.dataSource === 'legacy' && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard title="Tồn đầu kỳ" metric={data.inventoryOpeningQuantity} subtitle={formatVND(data.inventoryOpeningValue)} icon={Package} accentColor="blue" />
            <KpiCard title="Nhập trong kỳ" metric={data.inventoryInQuantity} subtitle={formatVND(data.inventoryInValue)} icon={ArrowDownToLine} accentColor="purple" />
            <KpiCard title="Xuất trong kỳ (giá vốn)" metric={data.inventoryOutQuantity} subtitle={formatVND(data.inventoryOutValue)} icon={TrendingDown} accentColor="rose" />
            <KpiCard title="Tồn cuối kỳ" metric={data.inventoryClosingQuantity} subtitle={formatVND(data.inventoryClosingValue)} icon={Package} accentColor="emerald" />
          </div>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {data.dataSource !== 'legacy' && <>
            <KpiCard
              title="Doanh thu thuần"
              metric={data.netRevenue}
              context="Trong kỳ phân tích"
              favorableWhen="up"
              icon={DollarSign}
              accentColor="blue"
            />
            <KpiCard
              title="Giá vốn (COGS)"
              metric={data.cogs}
              context="Trong kỳ phân tích"
              favorableWhen="down"
              icon={TrendingDown}
              accentColor="rose"
            />
            <KpiCard
              title="Lợi nhuận gộp"
              metric={data.grossProfit}
              context="Doanh thu − Giá vốn"
              favorableWhen="up"
              icon={TrendingUp}
              accentColor="green"
            />
            <KpiCard
              title="Giá trị nhập kho"
              metric={data.purchaseValue}
              context="Trong kỳ phân tích"
              icon={ArrowDownToLine}
              accentColor="purple"
            />
            </>}
            <KpiCard
              title="Giá trị tồn hiện tại"
              metric={data.currentStockValue}
              context={`Snapshot ${formatDate(data.snapshotAsOf)}`}
              subtitle={`${data.currentStockQuantity.toLocaleString('vi-VN')} đơn vị · Không phụ thuộc bộ lọc`}
              icon={Package}
              accentColor="emerald"
            />
          </div>

          {/* 3. Executive Insights */}
          {data.insights.length > 0 && <InsightPanel insights={data.insights} />}

          {/* 4. Trend Charts Section */}
          {data.dataSource !== 'legacy' && <TrendChartSection series={data.trendSeries} groupBy={appliedParams.groupBy} dataSource={data.dataSource} />}

          {/* 5. Operations Analysis Grid (3 Columns) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <StockAlertCard
              alerts={data.stockAlertsPreview}
              negativeStockPreview={data.negativeStockPreview}
              outOfStockPreview={data.outOfStockPreview}
              lowStockPreview={data.lowStockPreview}
              allStockAlertsPreview={data.allStockAlertsPreview}
              negativeStockCount={data.negativeStockCount}
              outOfStockCount={data.outOfStockCount}
              lowStockCount={data.lowStockCount}
            />
            <TopProductsCard
              topSelling={data.topSelling}
              topImported={data.topImported}
              periodLabel={`${formatDate(data.resolvedDateFrom)} – ${formatDate(data.resolvedDateTo)}`}
            />
            <RecentTransactionsCard
              transactions={data.recentTransactions}
              periodLabel={`${formatDate(data.resolvedDateFrom)} – ${formatDate(data.resolvedDateTo)}`}
            />
          </div>
        </>
      )}
    </div>
  )
}
