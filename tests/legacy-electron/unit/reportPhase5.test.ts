import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb, teardownTestDb } from '../helpers/testDatabase'
import { getSqlite } from '../../electron/db/connection'
import { getReportRepository } from '../../electron/repositories/reportRepository'
import { getProductRepository } from '../../electron/repositories/productRepository'

function seed(): void {
  const { sqlite } = setupTestDb()
  sqlite.exec(`
    INSERT INTO products (product_code,product_name,animal_category,package_weight_grams,inventory_unit,current_sale_price)
    VALUES ('P1','Cám heo','heo',25000,'Bao',70000);
    INSERT INTO suppliers (company_name) VALUES ('NCC A');
    INSERT INTO purchase_invoices (receipt_code,invoice_number,invoice_date,received_date,supplier_id,grand_total,paid_amount,remaining_amount,status)
    VALUES ('PN1','00049','2026-01-01','2026-01-01',1,500000,100000,400000,'xac_nhan');
    INSERT INTO supplier_payments (purchase_invoice_id,payment_date,amount) VALUES (1,'2026-01-05',100000);
    INSERT INTO sales_invoices (issue_code,electronic_invoice_number,invoice_date,buyer_type,buyer_name,subtotal,grand_total,total_cost,estimated_profit,status)
    VALUES ('PX1','000106','2026-01-10','khach_le','Khách A',300000,300000,200000,100000,'xac_nhan'),
           ('PX2','000107','2026-01-11','khach_le','Khách B',999999,999999,1,999998,'huy');
    INSERT INTO sales_invoice_items (sales_invoice_id,product_id,quantity,unit_sale_price,unit_cost_at_sale,line_revenue,line_cost,estimated_profit)
    VALUES (1,1,5,60000,40000,300000,200000,100000),(2,1,1,999999,1,999999,1,999998);
    INSERT INTO inventory_transactions (transaction_date,product_id,transaction_type,source_type,source_id,quantity_in,quantity_out,unit_cost,stock_before,stock_after,old_average_cost,new_average_cost,created_at)
    VALUES ('2026-01-01',1,'nhap','purchase_invoice',1,10,0,40000,0,10,0,40000,'2026-01-01 08:00:00'),
           ('2026-01-10',1,'xuat','sales_invoice',1,0,5,40000,10,5,40000,40000,'2026-01-10 08:00:00');
  `)
}

describe('Phase 5 reports', () => {
  beforeEach(seed)
  afterEach(teardownTestDb)
  const params = { dateFrom: '2026-01-01', dateTo: '2026-01-31' }

  it('tính nhập xuất tồn và cost snapshot', () => {
    expect(getReportRepository().inventory(params)[0]).toMatchObject({
      openingStock: 0, totalPurchaseQty: 10, totalSaleQty: 5,
      closingStock: 5, closingAverageCost: 40000, closingValue: 200000,
    })
  })

  it('doanh thu dùng cost lịch sử và bỏ phiếu hủy', () => {
    getSqlite().prepare('UPDATE products SET average_cost=999999 WHERE id=1').run()
    const report = getReportRepository().revenue(params)
    expect(report).toMatchObject({ totalRevenue: 300000, totalCost: 200000, totalProfit: 100000, invoiceCount: 1 })
    expect(report.rows[0].profitMargin).toBe(33.33)
  })

  it('tổng hợp sản phẩm và công nợ từ payments', () => {
    expect(getReportRepository().productSales(params)[0]).toMatchObject({
      quantitySold: 5, revenue: 300000, cost: 200000, profit: 100000,
    })
    const debt = getReportRepository().supplierDebt(params)[0]
    expect(debt).toMatchObject({ totalPurchased: 500000, totalPaid: 100000, totalDebt: 400000, snapshotConsistent: true })
  })

  it('ghi lịch sử khi đổi giá, không ghi khi giá giữ nguyên', async () => {
    await getProductRepository().update({ id: 1, currentSalePrice: 80000 })
    await getProductRepository().update({ id: 1, currentSalePrice: 80000, notes: 'Không đổi giá' })
    const history = getReportRepository().priceHistory({ dateFrom: '2026-01-01', dateTo: '2026-12-31' })
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ oldPrice: 70000, newPrice: 80000, difference: 10000 })
  })
})
