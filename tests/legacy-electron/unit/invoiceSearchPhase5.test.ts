import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb, teardownTestDb } from '../helpers/testDatabase'
import { getReportRepository } from '../../electron/repositories/reportRepository'

describe('invoice search Phase 5', () => {
  beforeEach(() => {
    const { sqlite } = setupTestDb()
    sqlite.exec(`
      INSERT INTO products(product_code,product_name,animal_category,package_weight_grams,inventory_unit) VALUES('P1','Cám heo','heo',1,'Bao');
      INSERT INTO suppliers(company_name) VALUES('NCC A');
      INSERT INTO purchase_invoices(receipt_code,invoice_number,invoice_date,received_date,supplier_id,status) VALUES('PN1','000049','2026-02-01','2026-02-01',1,'nhap');
      INSERT INTO purchase_invoice_items(purchase_invoice_id,product_id,quantity,invoice_unit_price,effective_unit_cost,line_total) VALUES(1,1,1,1,1,1);
      INSERT INTO sales_invoices(issue_code,electronic_invoice_number,invoice_date,buyer_type,status) VALUES('PX1','000106','2026-02-02','khach_le','xac_nhan');
      INSERT INTO sales_invoice_items(sales_invoice_id,product_id,quantity,unit_sale_price,unit_cost_at_sale,line_revenue,line_cost,estimated_profit) VALUES(1,1,1,1,1,1,1,0);
    `)
  })
  afterEach(teardownTestDb)

  it('tìm đúng chuỗi có số 0 đầu và lọc loại/trạng thái', () => {
    const base = { dateFrom: '2026-02-01', dateTo: '2026-02-28', page: 1, pageSize: 20 }
    expect(getReportRepository().invoiceSearch({ ...base, search: '000049' }).items[0].invoiceType).toBe('purchase')
    expect(getReportRepository().invoiceSearch({ ...base, search: '000106', invoiceType: 'sale' }).items[0].documentCode).toBe('PX1')
    expect(getReportRepository().invoiceSearch({ ...base, status: 'nhap' }).items).toHaveLength(1)
    expect(getReportRepository().invoiceSearch({ ...base, search: 'Cám heo' }).total).toBe(2)
  })

  it('phân trang không lẫn dữ liệu', () => {
    const result = getReportRepository().invoiceSearch({
      dateFrom: '2026-02-01', dateTo: '2026-02-28', page: 1, pageSize: 1,
    })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(2)
  })
})
