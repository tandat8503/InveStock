import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getInventoryTransactionMeta } from '../../src/utils/transaction'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('product hardening contracts', () => {
  it.each([
    ['nhap', 'Nhập kho', 'in'],
    ['xuat', 'Xuất kho', 'out'],
    ['purchase_cancel', 'Hủy nhập', 'out'],
    ['sale_cancel', 'Hủy xuất', 'in'],
    ['inventory_adjustment_in', 'Điều chỉnh tăng', 'in'],
    ['inventory_adjustment_out', 'Điều chỉnh giảm', 'out'],
    ['opening_balance', 'Số dư khởi tạo', 'neutral'],
  ] as const)('maps %s to its business label and direction', (type, label, direction) => {
    expect(getInventoryTransactionMeta(type)).toMatchObject({ label, direction })
  })

  it('renders neutral opening balance without negative zero', () => {
    const code = source('src/pages/Products/ProductDetail.tsx')
    expect(getInventoryTransactionMeta('opening_balance').direction).toBe('neutral')
    expect(code).toContain(": '—'")
    expect(code).not.toContain("const isIn = tx.quantityIn > 0")
  })

  it('keeps history and price failures separate from empty states with retry', () => {
    const code = source('src/pages/Products/ProductDetail.tsx')
    for (const state of ['historyLoading', 'historyError', 'priceLoading', 'priceError']) {
      expect(code).toContain(state)
    }
    expect(code).toContain('onRetry={() => { void loadHistory() }}')
    expect(code).toContain('onRetry={() => { void loadPriceHistory() }}')
  })

  it('guards product toggle and stale list responses', () => {
    const code = source('src/pages/Products/ProductList.tsx')
    expect(code).toContain('if (togglingProductId !== null) return')
    expect(code).toContain('isLoading={togglingProductId !== null}')
    expect(code).toContain('if (requestId !== requestIdRef.current) return')
    expect(code).not.toContain('Reset page to 1 when filters change')
  })

  it('uses unit and status filters in empty-state semantics', () => {
    const code = source('src/pages/Products/ProductList.tsx')
    expect(code).toContain("inventoryUnit !== ''")
    expect(code).toContain("activeOnly !== 'all'")
    expect(code).toContain("hasActiveFilters ? 'Không tìm thấy sản phẩm phù hợp' : 'Chưa có sản phẩm nào'")
  })

  it('does not expose active lifecycle in the master-data edit form', () => {
    const code = source('src/pages/Products/ProductForm.tsx')
    expect(code).not.toContain('label="Trạng thái hoạt động"')
    const updateBlock = code.slice(code.indexOf('appCommands.products.update'), code.indexOf('})', code.indexOf('appCommands.products.update')))
    expect(updateBlock).not.toContain('active:')
  })
})
