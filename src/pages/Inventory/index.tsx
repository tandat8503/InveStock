import { appCommands } from '@/lib/commands'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, EmptyState, ErrorState, LoadingState, Pagination, SearchInput, Select, DatePicker } from '@/components/ui'
import type { InventorySummaryDTO, PeriodResponse, CurrentInventoryRowDTO } from '@shared/ipc-types'
import { InventoryTable } from './InventoryTable'
import { ProductStockCard } from './ProductStockCard'
import { InventoryAdjustmentModal } from './InventoryAdjustmentModal'
import { useUIStore } from '@/stores/uiStore'
import { formatDate } from '@/utils/formatters'

export function InventoryPage() {
  const [rows, setRows] = useState<(InventorySummaryDTO | CurrentInventoryRowDTO)[] | null>(null)
  const [period, setPeriod] = useState<PeriodResponse<InventorySummaryDTO> | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const currentMonthStart = `${today.slice(0, 7)}-01`
  const [viewMode, setViewMode] = useState<'current' | 'historical'>('current')
  const [draftDates, setDraftDates] = useState({ dateFrom: today, dateTo: today })
  const [appliedDates, setAppliedDates] = useState(draftDates)
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState('')
  const [page, setPage] = useState(1)
  const [productId, setProductId] = useState<number | null>(null)
  const [lowStockThreshold, setLowStockThreshold] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdjustment, setShowAdjustment] = useState(false)
  const addNotification = useUIStore((state) => state.addNotification)
  const pendingFeedback = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    if (viewMode === 'current') {
      const result = await appCommands.inventory.getCurrentInventory()
      if (result.success && result.data) {
        setRows(result.data)
        setPeriod(null)
      } else {
        setError(result.error ?? 'Không tải được tồn kho hiện tại')
      }
    } else {
      const result = await appCommands.inventory.summary(appliedDates)
      if (result.success && result.data) {
        setRows(result.data.rows)
        setPeriod(result.data)
        if (pendingFeedback.current) {
          addNotification({
            type: 'success',
            message: `Đã cập nhật tồn kho: ${formatDate(result.data.resolvedDateFrom)} – ${formatDate(result.data.resolvedDateTo)}`,
          })
          pendingFeedback.current = false
        }
      } else {
        setError(result.error ?? 'Không tải được tồn kho')
      }
    }
    setLoading(false)
  }, [viewMode, appliedDates, addNotification])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void appCommands.settings.get().then((result) => {
      if (result.data) setLowStockThreshold(result.data.lowStockThreshold)
    })
  }, [])

  const filtered = rows?.filter((row) =>
    `${row.productCode} ${row.productName}`.toLowerCase().includes(search.toLowerCase()) &&
    (!category || row.animalCategory === category) &&
    (!unit || row.inventoryUnit === unit)
  ) ?? []

  const pageSize = 20
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)

  const getStock = (r: InventorySummaryDTO | CurrentInventoryRowDTO) => {
    return viewMode === 'current' ? (r as CurrentInventoryRowDTO).currentStock : (r as InventorySummaryDTO).closingStock
  }

  const lowStockCount =
    lowStockThreshold === null
      ? 0
      : rows?.filter((r) => {
          const stock = getStock(r)
          return stock > 0 && stock <= lowStockThreshold
        }).length ?? 0

  const outOfStockCount = rows?.filter((r) => getStock(r) === 0).length ?? 0
  const negativeStockCount = rows?.filter((r) => getStock(r) < 0).length ?? 0

  const applyDates = () => {
    if (!draftDates.dateFrom || !draftDates.dateTo || draftDates.dateFrom > draftDates.dateTo) {
      addNotification({ type: 'warning', message: 'Vui lòng chọn khoảng ngày hợp lệ' })
      return
    }
    pendingFeedback.current = true
    setAppliedDates({ ...draftDates })
  }

  const resetFilters = () => {
    setSearch('')
    setCategory('')
    setUnit('')
    setPage(1)
    if (viewMode === 'historical') {
      setDraftDates({ dateFrom: currentMonthStart, dateTo: today })
    }
  }

  const hasDisplayFilters = search !== '' || category !== '' || unit !== ''
  const quarterYear = Number(draftDates.dateFrom.slice(0, 4)) || new Date().getFullYear()

  const selectQuarter = (value: string) => {
    if (!value) return
    const quarter = Number(value)
    const startMonth = (quarter - 1) * 3 + 1
    const endMonth = startMonth + 2
    const endDay = new Date(quarterYear, endMonth, 0).getDate()
    setDraftDates({
      dateFrom: `${quarterYear}-${String(startMonth).padStart(2, '0')}-01`,
      dateTo: `${quarterYear}-${String(endMonth).padStart(2, '0')}-${endDay}`,
    })
  }

  const emptyMessage =
    rows && rows.length === 0
      ? 'Chưa có dữ liệu. Bạn có thể bắt đầu nhập sản phẩm mới hoặc khôi phục bản dữ liệu có sẵn.'
      : (period?.message ?? 'Không có dữ liệu tồn kho')

  return (
    <div className="flex h-full flex-col p-4 sm:p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Tồn kho</h1>
          <p className="page-subtitle">
            {viewMode === 'current'
              ? 'Ảnh chụp tồn kho tại ngày hôm nay'
              : 'Tồn cuối tại ngày kết thúc kỳ đã chọn'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            {negativeStockCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-purple-800">
                <span className="h-2 w-2 rounded-full bg-purple-600" />
                <span>Tồn âm – cần đối soát: <strong>{negativeStockCount}</strong> mặt hàng</span>
              </div>
            )}
            {outOfStockCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-red-700">
                <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
                <span>Hết hàng: <strong>{outOfStockCount}</strong> mặt hàng</span>
              </div>
            )}
            {lowStockThreshold !== null && lowStockCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Sắp hết (≤{lowStockThreshold}): <strong>{lowStockCount}</strong> mặt hàng</span>
              </div>
            )}
          </div>
          <Button onClick={() => setShowAdjustment(true)}>Điều chỉnh tồn</Button>
        </div>
      </div>
      <div className="mb-4 mt-3 flex gap-2" role="group" aria-label="Chế độ xem tồn kho">
        <Button
          size="sm"
          variant={viewMode === 'current' ? 'primary' : 'secondary'}
          onClick={() => {
            setViewMode('current')
            setDraftDates({ dateFrom: today, dateTo: today })
            setAppliedDates({ dateFrom: today, dateTo: today })
            pendingFeedback.current = true
          }}
        >
          Tồn hiện tại
        </Button>
        <Button
          size="sm"
          variant={viewMode === 'historical' ? 'primary' : 'secondary'}
          onClick={() => {
            setViewMode('historical')
            setDraftDates({ dateFrom: currentMonthStart, dateTo: today })
            setAppliedDates({ dateFrom: currentMonthStart, dateTo: today })
          }}
        >
          Xem tồn lịch sử
        </Button>
      </div>
      <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="grid items-center gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:grid-cols-[minmax(320px,1fr)_minmax(180px,240px)_minmax(160px,220px)_auto]">
          <SearchInput
            className="min-w-0 md:col-span-3 lg:col-span-1"
            inputClassName="h-10"
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            placeholder="Tìm mã hoặc tên sản phẩm"
          />
          <Select
            aria-label="Lọc theo vật nuôi"
            title="Lọc theo vật nuôi"
            className="h-10"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setPage(1)
            }}
            options={[
              { value: '', label: 'Mọi vật nuôi' },
              { value: 'heo', label: 'Heo' },
              { value: 'ga', label: 'Gà' },
              { value: 'vit', label: 'Vịt' },
              { value: 'bo', label: 'Bò' },
              { value: 'de', label: 'Dê' },
              { value: 'khac', label: 'Khác' },
            ]}
          />
          <Select
            aria-label="Lọc theo đơn vị"
            title="Lọc theo đơn vị"
            className="h-10"
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value)
              setPage(1)
            }}
            options={[
              { value: '', label: 'Mọi đơn vị' },
              { value: 'Bao', label: 'Bao' },
              { value: 'Tui', label: 'Túi' },
              { value: 'Bich', label: 'Bịch' },
            ]}
          />
          <Button size="sm" variant="secondary" disabled={!hasDisplayFilters} onClick={resetFilters}>
            Đặt lại
          </Button>
        </div>
        {viewMode === 'historical' && <div data-testid="historical-date-filters"
          className="mt-2.5 flex flex-wrap items-center gap-2.5 border-t border-gray-100 pt-2.5"
        >
            <div className="flex items-center gap-2 text-xs font-medium text-gray-600 w-[175px]">
              <DatePicker
                placeholder="Từ ngày"
                value={draftDates.dateFrom || ''}
                onChange={(val) => setDraftDates((value) => ({ ...value, dateFrom: val }))}
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-gray-600 w-[175px]">
              <DatePicker
                placeholder="Đến ngày"
                value={draftDates.dateTo || ''}
                onChange={(val) => setDraftDates((value) => ({ ...value, dateTo: val }))}
              />
            </div>
            <select
              aria-label="Chọn theo quý"
              className="form-input h-9 w-[190px]"
              defaultValue=""
              onChange={(event) => selectQuarter(event.target.value)}
            >
              <option value="">Chọn theo quý ({quarterYear})</option>
              <option value="1">Quý I</option>
              <option value="2">Quý II</option>
              <option value="3">Quý III</option>
              <option value="4">Quý IV</option>
            </select>
            <Button className="h-9 min-w-24" onClick={applyDates}>
              Áp dụng
            </Button>
            <Button className="h-10" variant="secondary" onClick={() => setDraftDates({ dateFrom: currentMonthStart, dateTo: today })}>
              Đặt lại ngày
            </Button>
          </div>
        }
      </div>
      {viewMode === 'historical' && period && (
        <div
          className={`mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
            period.dataCoverage === 'complete'
              ? 'border-blue-100 bg-blue-50/70 text-blue-800'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <span>
            <strong>Đang xem:</strong> {formatDate(period.resolvedDateFrom)} – {formatDate(period.resolvedDateTo)}
          </span>
          <span className="rounded-full bg-white px-2 py-0.5 font-semibold">
            {period.dataSource === 'legacy'
              ? 'Dữ liệu lịch sử'
              : period.dataSource === 'mixed'
              ? 'Dữ liệu kết hợp'
              : 'Dữ liệu InveStock'}
          </span>
          {period.message && <span>{period.message}</span>}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : !filtered.length ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <>
            <InventoryTable rows={visible} viewMode={viewMode} onOpen={setProductId} lowStockThreshold={lowStockThreshold ?? 0} />
            <Pagination currentPage={page} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} />
          </>
        )}
      </div>
      <ProductStockCard productId={productId} onClose={() => setProductId(null)} />
      <InventoryAdjustmentModal isOpen={showAdjustment} onClose={() => { setShowAdjustment(false); void load() }} />
    </div>
  )
}
