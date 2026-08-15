import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb, teardownTestDb } from '../helpers/testDatabase'
import { getSqlite } from '../../electron/db/connection'
import { getSaleRepository } from '../../electron/repositories/saleRepository'
import { getSaleService } from '../../electron/services/saleService'
import { getInventoryRepository } from '../../electron/repositories/inventoryRepository'

const oneItem = {
  electronicInvoiceNumber: ' 00000106 ',
  invoiceDate: '2026-07-27',
  buyerType: 'khach_le' as const,
  buyerName: ' Khách A ',
  items: [{ productId: 1, quantity: 2, unitSalePrice: 80_000 }],
}

function seed(): void {
  const { sqlite } = setupTestDb()
  sqlite.prepare(`INSERT INTO products
    (product_code, product_name, animal_category, package_weight_grams,
     inventory_unit, current_stock, average_cost)
    VALUES ('P1', 'Cám heo', 'heo', 25000, 'Bao', 10, 50000),
           ('P2', 'Cám gà', 'ga', 25000, 'Tui', 3, 30000)`).run()
  sqlite.prepare(`INSERT INTO inventory_transactions
    (transaction_date, product_id, transaction_type, source_type, source_id,
     quantity_in, stock_before, stock_after, unit_cost)
    VALUES ('2026-07-20', 1, 'nhap', 'purchase_invoice', 1, 10, 0, 10, 50000),
           ('2026-07-20', 2, 'nhap', 'purchase_invoice', 1, 3, 0, 3, 30000)`).run()
}

describe('Phase 4 sale workflow', () => {
  beforeEach(seed)
  afterEach(teardownTestDb)

  it('backend tính draft, trim và giữ số 0 đầu', async () => {
    const sale = await getSaleRepository().create(oneItem)
    expect(sale.issueCode).toBe('PX000001')
    expect(sale.electronicInvoiceNumber).toBe('00000106')
    expect(sale.items[0].lineRevenue).toBe(160000)
    expect(sale.items[0].lineCost).toBe(100000)
  })

  it('sequence không tái sử dụng mã sau khi xóa nháp', async () => {
    const first = await getSaleRepository().create({ ...oneItem, electronicInvoiceNumber: undefined })
    const second = await getSaleRepository().create({ ...oneItem, electronicInvoiceNumber: undefined })
    await getSaleRepository().deleteDraft(first.id)
    const third = await getSaleRepository().create({ ...oneItem, electronicInvoiceNumber: undefined })
    expect([second.issueCode, third.issueCode]).toEqual(['PX000002', 'PX000003'])
  })

  it('chặn hóa đơn trùng và cho nhiều số null', async () => {
    await getSaleRepository().create(oneItem)
    await expect(getSaleRepository().create(oneItem)).rejects.toThrow('đã tồn tại')
    await getSaleRepository().create({ ...oneItem, electronicInvoiceNumber: ' ' })
    await expect(getSaleRepository().create({ ...oneItem, electronicInvoiceNumber: undefined })).resolves.toBeDefined()
  })

  it('confirm chốt cost mới, trừ tồn và tính profit', async () => {
    const sqlite = getSqlite()
    const draft = await getSaleRepository().create(oneItem)
    sqlite.prepare('UPDATE products SET average_cost = 60000 WHERE id = 1').run()
    const sale = await getSaleService().confirm(draft.id)
    expect(sale.items[0].unitCostAtSale).toBe(60000)
    expect(sale.totalCost).toBe(120000)
    expect(sale.estimatedProfit).toBe(40000)
    expect(sale.items[0].currentStock).toBe(8)
    const tx = sqlite.prepare("SELECT * FROM inventory_transactions WHERE transaction_type = 'xuat'").get() as {
      stock_before: number; stock_after: number; old_average_cost: number; new_average_cost: number
    }
    expect(tx).toMatchObject({ stock_before: 10, stock_after: 8, old_average_cost: 60000, new_average_cost: 60000 })
  })

  it('rollback toàn bộ nếu item thứ hai thiếu tồn', async () => {
    const sqlite = getSqlite()
    const draft = await getSaleRepository().create({
      ...oneItem, items: [
        { productId: 1, quantity: 2, unitSalePrice: 80000 },
        { productId: 2, quantity: 4, unitSalePrice: 70000 },
      ],
    })
    await expect(getSaleService().confirm(draft.id)).rejects.toThrow('thiếu 1 Tui')
    expect(sqlite.prepare('SELECT current_stock FROM products WHERE id = 1').pluck().get()).toBe(10)
    expect((await getSaleRepository().getById(draft.id)).status).toBe('nhap')
  })

  it('cancel yêu cầu lý do, hoàn tồn và giữ transaction gốc', async () => {
    const sqlite = getSqlite()
    const draft = await getSaleRepository().create(oneItem)
    await getSaleService().confirm(draft.id)
    await expect(getSaleService().cancel(draft.id, ' ')).rejects.toThrow('5 đến 500')
    const cancelled = await getSaleService().cancel(draft.id, 'Khách trả hàng')
    expect(cancelled.cancellationReason).toBe('Khách trả hàng')
    expect(cancelled.items[0].currentStock).toBe(10)
    expect(sqlite.prepare("SELECT COUNT(*) FROM inventory_transactions WHERE source_type = 'sales_invoice'").pluck().get()).toBe(2)
    await expect(getSaleService().cancel(draft.id, 'Hủy lần nữa')).rejects.toThrow('đã được hủy')
  })

  it('phát hiện lệch current stock và ledger', () => {
    const sqlite = getSqlite()
    expect(getInventoryRepository().checkConsistency()).toHaveLength(0)
    sqlite.prepare('UPDATE products SET current_stock = 99 WHERE id = 1').run()
    expect(getInventoryRepository().checkConsistency()).toEqual([
      { productId: 1, currentStock: 99, ledgerStock: 10 },
    ])
  })

  it('cho xuất khi giá vốn bằng 0 và lợi nhuận bằng doanh thu', async () => {
    const sqlite = getSqlite()
    sqlite.prepare('UPDATE products SET average_cost = 0 WHERE id = 1').run()
    const draft = await getSaleRepository().create(oneItem)
    const sale = await getSaleService().confirm(draft.id)
    expect(sale.totalCost).toBe(0)
    expect(sale.estimatedProfit).toBe(sale.grandTotal)
  })

  it('tính tồn đầu, nhập, xuất và tồn cuối theo khoảng ngày', async () => {
    const before = await getInventoryRepository().getSummary({
      dateFrom: '2026-07-21', dateTo: '2026-07-27',
    })
    expect(before.find((row) => row.productId === 1)).toMatchObject({
      openingStock: 10, totalIn: 0, totalOut: 0, closingStock: 10,
    })
    const throughOpening = await getInventoryRepository().getSummary({
      dateFrom: '2026-07-20', dateTo: '2026-07-20',
    })
    expect(throughOpening.find((row) => row.productId === 1)).toMatchObject({
      openingStock: 0, totalIn: 10, totalOut: 0, closingStock: 10,
    })
  })
})
