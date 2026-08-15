import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { ToastList } from '../../src/components/ui/ToastHost'
import { useUIStore } from '../../src/stores/uiStore'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

beforeEach(() => useUIStore.setState({ notifications: [] }))

describe('filter apply UX contracts', () => {
  it('report Apply has a single backend invocation path', () => {
    const code = source('src/pages/Reports/ImportExportReport.tsx')
    expect(code.match(/appCommands\.reports\.importExport\(f\)/g)).toHaveLength(1)
  })

  it('report success feedback and persistent applied range are visible', () => {
    const code = source('src/pages/Reports/ImportExportReport.tsx')
    expect(code).toContain('Đã áp dụng bộ lọc')
    expect(code).toContain('Đang xem:')
  })

  it('inventory date edits only update draft dates', () => {
    const code = source('src/pages/Inventory/index.tsx')
    expect(code).toContain('setDraftDates')
    expect(code).toContain('appCommands.inventory.summary(appliedDates)')
  })

  it('inventory Apply promotes exact draft dates', () => {
    const code = source('src/pages/Inventory/index.tsx')
    expect(code).toContain('setAppliedDates({ ...draftDates })')
    expect(code).toContain('Đã cập nhật tồn kho:')
  })

  it('inventory current and historical modes keep date controls distinct', () => {
    const code = source('src/pages/Inventory/index.tsx')
    expect(code).toContain("viewMode === 'historical' && <div data-testid=\"historical-date-filters\"")
    expect(code).toContain("viewMode === 'historical' && period")
    expect(code).toContain("setAppliedDates({ dateFrom: today, dateTo: today })")
  })

  it('inventory toolbar keeps local search, category and unit filters', () => {
    const code = source('src/pages/Inventory/index.tsx')
    expect(code).toContain('Tìm mã hoặc tên sản phẩm')
    expect(code).toContain('!category || row.animalCategory === category')
    expect(code).toContain('!unit || row.inventoryUnit === unit')
  })

  it('inventory reset restores display filters', () => {
    const code = source('src/pages/Inventory/index.tsx')
    const resetBlock = code.slice(code.indexOf('const resetFilters'), code.indexOf('const hasDisplayFilters'))
    expect(resetBlock).toContain("setSearch('')")
    expect(resetBlock).toContain("setCategory('')")
    expect(resetBlock).toContain("setUnit('')")
  })

  it('inventory adjustment flow remains accessible', () => {
    const code = source('src/pages/Inventory/index.tsx')
    expect(code).toContain('setShowAdjustment(true)')
    expect(code).toContain('<InventoryAdjustmentModal')
  })

  it('inventory adjustment requires confirmation before invoking backend', () => {
    const code = source('src/pages/Inventory/InventoryAdjustmentModal.tsx')
    const requestBlock = code.slice(code.indexOf('const requestSubmit'), code.indexOf('const confirmSubmit'))
    const confirmBlock = code.slice(code.indexOf('const confirmSubmit'), code.indexOf('const handleCloseAttempt'))
    expect(requestBlock).toContain('setShowAdjustmentConfirm(true)')
    expect(requestBlock).not.toContain('createAdjustment(')
    expect(confirmBlock.match(/createAdjustment\(/g)).toHaveLength(1)
    expect(code).toContain('Xác nhận điều chỉnh tồn kho?')
    expect(code).toContain('Xác nhận điều chỉnh')
  })

  it('inventory adjustment exposes safe validation and success feedback', () => {
    const code = source('src/pages/Inventory/InventoryAdjustmentModal.tsx')
    expect(code).toContain('min={0}')
    expect(code).toContain('Tồn thực tế không được nhỏ hơn 0.')
    expect(code).toContain('Đã điều chỉnh tồn kho thành công.')
    expect(code).toContain('isLoading={submitting}')
  })

  it('inventory stock statuses retain all business labels', () => {
    const code = source('src/pages/Inventory/InventoryTable.tsx')
    for (const label of ['Tồn âm – cần đối soát', 'Hết hàng', 'Sắp hết', 'An toàn']) {
      expect(code).toContain(label)
    }
  })

  it('dashboard draft changes do not drive the backend request', () => {
    const code = source('src/pages/Dashboard.tsx')
    expect(code).toContain('appCommands.dashboard.analytics(appliedParams)')
    expect(code).not.toContain('appCommands.dashboard.analytics(draftParams)')
  })

  it('dashboard Apply promotes the selected draft range', () => {
    const code = source('src/pages/Dashboard.tsx')
    expect(code).toContain('setAppliedParams({ ...draftParams })')
    expect(code).toContain('Đã áp dụng Dashboard:')
  })

  it('dashboard clearly separates period metrics from the current inventory snapshot', () => {
    const dashboard = source('src/pages/Dashboard.tsx')
    const kpi = source('src/components/dashboard/KpiCard.tsx')
    expect(dashboard).toContain('Kỳ phân tích giao dịch')
    expect(dashboard).toContain('Snapshot tồn kho tại')
    expect(dashboard).toContain('không thay đổi theo bộ lọc kỳ')
    expect(kpi).toContain('Kỳ trước không phát sinh — không tính %')
  })

  it('ToastHost renders notifications from the global store', () => {
    const markup = renderToStaticMarkup(<ToastList notifications={[{ id: 'test', type: 'success', message: 'Đã áp dụng bộ lọc' }]} onRemove={() => undefined} />)
    expect(markup).toContain('Đã áp dụng bộ lọc')
    expect(markup).toContain('role="status"')
  })

  it('revenue and product sales show applied range feedback', () => {
    for (const path of ['src/pages/Reports/RevenueReport.tsx', 'src/pages/Reports/ProductSalesReport.tsx']) {
      const code = source(path)
      expect(code).toContain('Đã áp dụng bộ lọc')
      expect(code).toContain('Đang xem:')
    }
  })

  it('supplier debt is explicitly current and has no ignored date filter', () => {
    const code = source('src/pages/Reports/SupplierDebtReport.tsx')
    expect(code).toContain('Công nợ nhà cung cấp hiện tại')
    expect(code).not.toContain('ReportDateFilter')
  })

  it('legacy product sales explain unavailable revenue instead of showing an empty result', () => {
    const code = source('src/pages/Reports/ProductSalesReport.tsx')
    expect(code).toContain('Dữ liệu lịch sử có số lượng xuất và giá vốn nhưng không có giá bán')
    expect(code).toContain('N/A')
  })

  it('dashboard models partial revenue coverage and inventory outflow as COGS', () => {
    const dashboard = source('src/pages/Dashboard.tsx')
    const chart = source('src/components/dashboard/TrendChartSection.tsx')
    expect(dashboard).toContain('Một phần dữ liệu')
    expect(chart).toContain("'Giá trị xuất': pt.cost")
    expect(chart).toContain('không phải doanh thu')
  })

  it('report parameter contract contains only Rust-supported fields', () => {
    const contract = source('shared/ipc-types.ts')
    const block = contract.slice(contract.indexOf('export interface ReportParams'), contract.indexOf('export interface ImportExportReportRow'))
    for (const unsupported of ['productId', 'supplierId', 'animalCategory', 'inventoryUnit', 'buyerType', 'sortDirection']) {
      expect(block).not.toContain(unsupported)
    }
    for (const supported of ['dateFrom', 'dateTo', 'invoiceType', 'status', 'search', 'sortBy', 'page', 'pageSize']) {
      expect(block).toContain(supported)
    }
  })

  it('public source packaging excludes private customer data', () => {
    expect(source('scripts/create-release-source.sh')).toContain("--exclude 'private-data/'")
    expect(source('.gitignore')).toContain('private-data/')
  })

  it('current and historical table columns differ correctly', () => {
    const tableCode = source('src/pages/Inventory/InventoryTable.tsx')
    expect(tableCode).toContain("viewMode === 'current'")
    expect(tableCode).toContain("Tồn hiện tại")
    expect(tableCode).toContain("Tồn đầu")
    expect(tableCode).toContain("Nhập")
    expect(tableCode).toContain("Xuất")
    expect(tableCode).toContain("Điều chỉnh")
    expect(tableCode).toContain("Tồn cuối")
  })

  it('current inventory renders authoritative values and hides unknown cost data', () => {
    const tableCode = source('src/pages/Inventory/InventoryTable.tsx')
    expect(tableCode).toContain("costDataStatus")
    expect(tableCode).toContain("costStatus === 'known' ? formatVND(row.averageCost) : '—'")
    expect(tableCode).toContain("costStatus === 'known' ? formatVND(value) : '—'")
    expect(tableCode).toContain('Dữ liệu giá vốn của sản phẩm này chưa được xác định hoặc cần đối soát.')
    expect(tableCode).not.toContain('currentStock * averageCost')
  })
})
