import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb, teardownTestDb } from '../helpers/testDatabase'
import { getSqlite } from '../../electron/db/connection'
import { getPurchaseRepository } from '../../electron/repositories/purchaseRepository'
import { getPurchaseService } from '../../electron/services/purchaseService'
import { allocateShippingByQuantity, allocateShippingByValue } from '../../electron/services/inventoryService'

function seed(): void {
  const { sqlite } = setupTestDb()
  sqlite.prepare("INSERT INTO suppliers (company_name) VALUES ('NCC A'), ('NCC B')").run()
  sqlite.prepare(`INSERT INTO products
    (product_code, product_name, animal_category, package_weight_grams, inventory_unit)
    VALUES ('P1', 'Cám 1', 'heo', 25000, 'Bao'), ('P2', 'Cám 2', 'ga', 25000, 'Bao')`).run()
}

const input = {
  invoiceNumber: '00004921',
  invoiceDate: '2026-07-27',
  receivedDate: '2026-07-27',
  supplierId: 1,
  discountAmount: 0,
  shippingCost: 5,
  shippingAllocationMethod: 'quantity' as const,
  taxAmount: 0,
  paymentMethod: 'chuyen_khoan' as const,
  items: [
    { productId: 1, quantity: 2, invoiceUnitPrice: 100, discountAmount: 0, shippingAllocation: 0 },
    { productId: 2, quantity: 1, invoiceUnitPrice: 200, discountAmount: 0, shippingAllocation: 0 },
  ],
}

describe('Phase 3 purchase workflow', () => {
  beforeEach(seed)
  afterEach(teardownTestDb)

  it('tạo nháp nhiều dòng, tự tính tổng và giữ số 0 đầu', async () => {
    const invoice = await getPurchaseRepository().create(input)
    expect(invoice.invoiceNumber).toBe('00004921')
    expect(invoice.items.map((item) => item.shippingAllocation)).toEqual([3, 2])
    expect(invoice.grandTotal).toBe(405)
    expect(invoice.paidAmount).toBe(0)
  })

  it('chặn số hóa đơn trùng cùng NCC nhưng cho NCC khác', async () => {
    await getPurchaseRepository().create(input)
    await expect(getPurchaseRepository().create({ ...input, invoiceNumber: ' 00004921 ' })).rejects.toThrow('đã tồn tại')
    await expect(getPurchaseRepository().create({ ...input, supplierId: 2 })).resolves.toBeDefined()
  })

  it('xác nhận và thanh toán nhiều lần; chặn hủy và giữ lịch sử', async () => {
    const draft = await getPurchaseRepository().create(input)
    const confirmed = await getPurchaseService().confirm(draft.id)
    expect(confirmed.status).toBe('xac_nhan')
    const first = {
      purchaseInvoiceId: draft.id, paymentDate: '2026-07-27', amount: 100,
      paymentMethod: 'tien_mat' as const,
    }
    await getPurchaseRepository().createPayment(first)
    await getPurchaseRepository().createPayment({ ...first, amount: 305 })
    expect((await getPurchaseRepository().getById(draft.id)).paymentStatus).toBe('da_thanh_toan')
    await expect(getPurchaseRepository().createPayment({ ...first, amount: 1 })).rejects.toThrow('vượt')
    await expect(getPurchaseService().cancel(draft.id, 'Nhập sai')).rejects.toThrow('đã phát sinh thanh toán')
    expect((await getPurchaseRepository().getPayments(draft.id))).toHaveLength(2)
  })

  it('chặn hủy thanh toán một phần và chặn payment không hợp lệ', async () => {
    const draft = await getPurchaseRepository().create(input)
    const payment = {
      purchaseInvoiceId: draft.id, paymentDate: '2026-07-27', amount: 10,
      paymentMethod: 'tien_mat' as const,
    }
    await expect(getPurchaseRepository().createPayment(payment)).rejects.toThrow('đã xác nhận')
    await getPurchaseService().confirm(draft.id)
    await expect(getPurchaseRepository().createPayment({ ...payment, amount: 1.5 })).rejects.toThrow('số nguyên')
    await getPurchaseRepository().createPayment(payment)
    await expect(getPurchaseService().cancel(draft.id)).rejects.toThrow('đã phát sinh thanh toán')
    expect(await getPurchaseRepository().getPayments(draft.id)).toHaveLength(1)
  })

  it('hủy hóa đơn chưa thanh toán, hoàn stock và ghi giao dịch đảo', async () => {
    const sqlite = getSqlite()
    const draft = await getPurchaseRepository().create(input)
    await getPurchaseService().confirm(draft.id)
    const cancelled = await getPurchaseService().cancel(draft.id, 'Nhập sai')
    expect(cancelled.status).toBe('huy')
    const products = sqlite.prepare('SELECT current_stock, average_cost, latest_purchase_price FROM products ORDER BY id').all() as {
      current_stock: number; average_cost: number; latest_purchase_price: number
    }[]
    expect(products.every((product) => product.current_stock === 0)).toBe(true)
    expect(products.every((product) => product.average_cost === 0)).toBe(true)
    expect(products.every((product) => product.latest_purchase_price === 0)).toBe(true)
    const transactions = sqlite.prepare(
      'SELECT transaction_type, old_average_cost, new_average_cost FROM inventory_transactions ORDER BY id'
    ).all() as { transaction_type: string; old_average_cost: number; new_average_cost: number }[]
    expect(transactions.filter((transaction) => transaction.transaction_type === 'nhap')).toHaveLength(2)
    expect(transactions.filter((transaction) => transaction.transaction_type === 'huy_nhap')).toHaveLength(2)
  })

  it('chặn hủy nháp, hủy lần hai và giao dịch phát sinh sau', async () => {
    const sqlite = getSqlite()
    const draft = await getPurchaseRepository().create(input)
    await expect(getPurchaseService().cancel(draft.id)).rejects.toThrow('Phiếu nháp')
    await getPurchaseService().confirm(draft.id)
    sqlite.prepare(`INSERT INTO inventory_transactions
      (transaction_date, product_id, transaction_type, source_type, source_id, stock_after)
      VALUES ('2026-07-28', 1, 'dieu_chinh', 'adjustment', 99, 2)`).run()
    await expect(getPurchaseService().cancel(draft.id)).rejects.toThrow('giao dịch kho phát sinh sau')
    sqlite.prepare('DELETE FROM inventory_transactions WHERE source_type = ?').run('adjustment')
    await getPurchaseService().cancel(draft.id)
    await expect(getPurchaseService().cancel(draft.id)).rejects.toThrow('đã được hủy')
    await expect(getPurchaseRepository().createPayment({
      purchaseInvoiceId: draft.id, paymentDate: '2026-07-27', amount: 1,
      paymentMethod: 'tien_mat',
    })).rejects.toThrow('đã xác nhận')
  })

  it('rollback confirm nếu item thứ hai lỗi', async () => {
    const sqlite = getSqlite()
    const draft = await getPurchaseRepository().create(input)
    sqlite.prepare('UPDATE products SET current_stock = -1 WHERE id = 2').run()
    await expect(getPurchaseService().confirm(draft.id)).rejects.toThrow('legacy đang âm')
    const first = sqlite.prepare('SELECT current_stock FROM products WHERE id = 1').get() as { current_stock: number }
    const invoice = sqlite.prepare('SELECT status FROM purchase_invoices WHERE id = ?').get(draft.id) as { status: string }
    expect(first.current_stock).toBe(0)
    expect(invoice.status).toBe('nhap')
    expect(sqlite.prepare('SELECT COUNT(*) FROM inventory_transactions').pluck().get()).toBe(0)
  })

  it('rollback toàn bộ cancel nếu item thứ hai không an toàn', async () => {
    const sqlite = getSqlite()
    const draft = await getPurchaseRepository().create(input)
    await getPurchaseService().confirm(draft.id)
    sqlite.prepare(`INSERT INTO inventory_transactions
      (transaction_date, product_id, transaction_type, source_type, source_id, stock_after)
      VALUES ('2026-07-28', 2, 'dieu_chinh', 'adjustment', 99, 1)`).run()
    await expect(getPurchaseService().cancel(draft.id)).rejects.toThrow('giao dịch kho phát sinh sau')
    const first = sqlite.prepare('SELECT current_stock FROM products WHERE id = 1').get() as { current_stock: number }
    const invoice = sqlite.prepare('SELECT status FROM purchase_invoices WHERE id = ?').get(draft.id) as { status: string }
    expect(first.current_stock).toBe(2)
    expect(invoice.status).toBe('xac_nhan')
    expect(sqlite.prepare("SELECT COUNT(*) FROM inventory_transactions WHERE transaction_type = 'huy_nhap'").pluck().get()).toBe(0)
  })
})

describe('shipping allocation', () => {
  it('phân bổ số lượng và giá trị đúng tuyệt đối khi có phần dư', () => {
    expect(allocateShippingByQuantity([{ quantity: 1 }, { quantity: 1 }, { quantity: 1 }], 10)).toEqual([3, 3, 4])
    expect(allocateShippingByValue([{ lineTotal: 1 }, { lineTotal: 2 }], 10)).toEqual([3, 7])
  })
  it('xử lý chi phí bằng 0 và chặn dữ liệu sai', () => {
    expect(allocateShippingByQuantity([{ quantity: 2 }], 0)).toEqual([0])
    expect(() => allocateShippingByQuantity([{ quantity: -1 }], 10)).toThrow()
  })
})
