import * as XLSX from 'xlsx'
import crypto from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb, teardownTestDb } from '../helpers/testDatabase'
import { getSqlite } from '../../electron/db/connection'
import { getProductRepository } from '../../electron/repositories/productRepository'
import { getSupplierRepository } from '../../electron/repositories/supplierRepository'
import { ImportExecutionService } from '../../electron/services/import/importExecutionService'
import { ImportSessionService } from '../../electron/services/import/importSessionService'
import { ImportValidationService } from '../../electron/services/import/importValidationService'
import type { ImportType, ImportValidateRequest } from '../../shared/ipc-types'

describe('Phase 6 import execution', () => {
  let sessions: ImportSessionService

  beforeEach(() => {
    setupTestDb()
    sessions = new ImportSessionService()
  })

  afterEach(() => teardownTestDb())

  function prepare(
    importType: ImportType,
    rows: unknown[][],
    mappings: ImportValidateRequest['mappings'],
    options: ImportValidateRequest['options'] = {}
  ): string {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Data')
    const id = crypto.randomUUID()
    sessions.create({
      id,
      filePath: '/tmp/test.xlsx',
      fileName: 'test.xlsx',
      fileHash: crypto.randomUUID().replaceAll('-', ''),
      workbook,
      workbookMetadata: { sheetNames: ['Data'], fileSize: 1 },
    })
    const validation = new ImportValidationService(sessions).validate({
      importSessionId: id,
      sheetName: 'Data',
      importType,
      headerRow: 0,
      mappings,
      options,
    })
    expect(validation.canExecute).toBe(true)
    return id
  }

  async function product(code: string, stock = 0, averageCost = 0) {
    const created = await getProductRepository().create({
      productCode: code,
      productName: code,
      animalCategory: 'khac',
      packageWeightGrams: 1,
      inventoryUnit: 'Bao',
      currentSalePrice: 100,
    })
    getSqlite().prepare(
      'UPDATE products SET current_stock = ?, average_cost = ? WHERE id = ?'
    ).run(stock, averageCost, created.id)
    return created
  }

  it('import products atomically và ghi audit thành công', async () => {
    const id = prepare('products', [
      ['Code', 'Name', 'Unit'], ['P1', 'One', 'Bao'], ['P2', 'Two', 'Túi'],
    ], [
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Name', targetField: 'productName' },
      { sourceColumn: 'Unit', targetField: 'inventoryUnit' },
    ])
    const result = await new ImportExecutionService(sessions).execute({ importSessionId: id })
    expect(result.importedCount).toBe(2)
    expect(getSqlite().prepare('SELECT COUNT(*) FROM products').pluck().get()).toBe(2)
    const audit = getSqlite().prepare('SELECT status, imported_rows FROM import_jobs').get() as {
      status: string
      imported_rows: number
    }
    expect(audit).toEqual({ status: 'success', imported_rows: 2 })
    expect(() => sessions.get(id)).toThrow(/không tồn tại/)
  })

  it('import products rollback dòng trước nếu dòng sau lỗi lúc execute', async () => {
    const id = prepare('products', [
      ['Code', 'Name', 'Unit'], ['P1', 'One', 'Bao'], ['P2', 'Two', 'Bao'],
    ], [
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Name', targetField: 'productName' },
      { sourceColumn: 'Unit', targetField: 'inventoryUnit' },
    ])
    await product('P2')
    await expect(new ImportExecutionService(sessions).execute({ importSessionId: id }))
      .rejects.toThrow(/P2/)
    expect(getSqlite().prepare(
      "SELECT COUNT(*) FROM products WHERE product_code = 'P1'"
    ).pluck().get()).toBe(0)
  })

  it('opening stock cập nhật product và ledger nhất quán', async () => {
    const created = await product('P1')
    const id = prepare('opening_inventory', [
      ['Code', 'Qty', 'Cost', 'Date'], ['P1', 7, 120, '2026-01-02'],
    ], [
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Qty', targetField: 'quantity' },
      { sourceColumn: 'Cost', targetField: 'unitCost' },
      { sourceColumn: 'Date', targetField: 'openingDate' },
    ])
    await new ImportExecutionService(sessions).execute({ importSessionId: id })
    const current = getSqlite().prepare(
      'SELECT current_stock, average_cost FROM products WHERE id = ?'
    ).get(created.id)
    const ledger = getSqlite().prepare(
      'SELECT quantity_in, stock_after, unit_cost FROM inventory_transactions WHERE product_id = ?'
    ).get(created.id)
    expect(current).toEqual({ current_stock: 7, average_cost: 120 })
    expect(ledger).toEqual({ quantity_in: 7, stock_after: 7, unit_cost: 120 })
  })

  it('purchase draft không tăng tồn; confirmed dùng PurchaseService và tính average cost', async () => {
    const created = await product('P1', 10, 100)
    const supplier = await getSupplierRepository().create({ companyName: 'Supplier' })
    const mappings = [
      { sourceColumn: 'Inv', targetField: 'invoiceNumber' },
      { sourceColumn: 'Date', targetField: 'invoiceDate' },
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Qty', targetField: 'quantity' },
      { sourceColumn: 'Price', targetField: 'unitPrice' },
    ]
    const rows = [['Inv', 'Date', 'Code', 'Qty', 'Price'], ['0001', '2026-01-01', 'P1', 10, 200]]
    const draft = prepare('purchase_invoices', rows, mappings, {
      defaultSupplierId: supplier.id, mode: 'import_as_draft',
    })
    await new ImportExecutionService(sessions).execute({ importSessionId: draft })
    expect(getSqlite().prepare('SELECT current_stock FROM products WHERE id = ?').pluck().get(created.id)).toBe(10)

    const confirmed = prepare('purchase_invoices', [
      ['Inv', 'Date', 'Code', 'Qty', 'Price'], ['0002', '2026-01-01', 'P1', 10, 200],
    ], mappings, { defaultSupplierId: supplier.id, mode: 'import_as_confirmed' })
    await new ImportExecutionService(sessions).execute({ importSessionId: confirmed })
    expect(getSqlite().prepare('SELECT current_stock, average_cost FROM products WHERE id = ?').get(created.id)).toEqual({
      current_stock: 20,
      average_cost: 150,
    })
  })

  it('sale draft không giảm tồn; confirmed chốt average cost hiện tại', async () => {
    const created = await product('P1', 10, 75)
    const mappings = [
      { sourceColumn: 'Inv', targetField: 'invoiceNumber' },
      { sourceColumn: 'Date', targetField: 'invoiceDate' },
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Qty', targetField: 'quantity' },
      { sourceColumn: 'Price', targetField: 'unitPrice' },
    ]
    const draft = prepare('sales_invoices', [
      ['Inv', 'Date', 'Code', 'Qty', 'Price'], ['S1', '2026-01-01', 'P1', 2, 100],
    ], mappings, { mode: 'import_as_draft' })
    await new ImportExecutionService(sessions).execute({ importSessionId: draft })
    expect(getSqlite().prepare('SELECT current_stock FROM products WHERE id = ?').pluck().get(created.id)).toBe(10)

    const confirmed = prepare('sales_invoices', [
      ['Inv', 'Date', 'Code', 'Qty', 'Price'], ['S2', '2026-01-01', 'P1', 3, 100],
    ], mappings, { mode: 'import_as_confirmed' })
    getSqlite().prepare('UPDATE products SET average_cost = 80 WHERE id = ?').run(created.id)
    await new ImportExecutionService(sessions).execute({ importSessionId: confirmed })
    expect(getSqlite().prepare('SELECT current_stock FROM products WHERE id = ?').pluck().get(created.id)).toBe(7)
    expect(getSqlite().prepare(
      `SELECT unit_cost_at_sale FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii.sales_invoice_id
       WHERE si.electronic_invoice_number = 'S2'`
    ).pluck().get()).toBe(80)
  })

  it('sale confirmed vượt tồn bị chặn khi validate', async () => {
    await product('P1', 1, 50)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Inv', 'Date', 'Code', 'Qty', 'Price'], ['S1', '2026-01-01', 'P1', 2, 100],
    ]), 'Data')
    const id = crypto.randomUUID()
    sessions.create({ id, filePath: '/tmp/x', fileName: 'x', fileHash: 'x', workbook, workbookMetadata: { sheetNames: ['Data'], fileSize: 1 } })
    const validation = new ImportValidationService(sessions).validate({
      importSessionId: id, sheetName: 'Data', importType: 'sales_invoices', headerRow: 0,
      mappings: [
        { sourceColumn: 'Inv', targetField: 'invoiceNumber' },
        { sourceColumn: 'Date', targetField: 'invoiceDate' },
        { sourceColumn: 'Code', targetField: 'productCode' },
        { sourceColumn: 'Qty', targetField: 'quantity' },
        { sourceColumn: 'Price', targetField: 'unitPrice' },
      ],
      options: { mode: 'import_as_confirmed' },
    })
    expect(validation.errors.some((error) => error.code === 'INSUFFICIENT_STOCK')).toBe(true)
  })

  it('invoice thứ hai lỗi rollback invoice đầu, tồn kho; audit lỗi vẫn còn', async () => {
    const first = await product('P1', 5, 10)
    const second = await product('P2', 5, 20)
    const id = prepare('sales_invoices', [
      ['Inv', 'Date', 'Code', 'Qty', 'Price'],
      ['S1', '2026-01-01', 'P1', 1, 100],
      ['S2', '2026-01-01', 'P2', 1, 100],
    ], [
      { sourceColumn: 'Inv', targetField: 'invoiceNumber' },
      { sourceColumn: 'Date', targetField: 'invoiceDate' },
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Qty', targetField: 'quantity' },
      { sourceColumn: 'Price', targetField: 'unitPrice' },
    ], { mode: 'import_as_confirmed', transactionMode: 'all_or_nothing' })
    getSqlite().prepare('UPDATE products SET active = 0 WHERE id = ?').run(second.id)
    await expect(new ImportExecutionService(sessions).execute({ importSessionId: id })).rejects.toThrow(/ngừng kinh doanh/)
    expect(getSqlite().prepare('SELECT COUNT(*) FROM sales_invoices').pluck().get()).toBe(0)
    expect(getSqlite().prepare('SELECT current_stock FROM products WHERE id = ?').pluck().get(first.id)).toBe(5)
    expect(getSqlite().prepare('SELECT status FROM import_jobs').pluck().get()).toBe('failed')
    expect(getSqlite().prepare('SELECT COUNT(*) FROM import_job_errors').pluck().get()).toBeGreaterThan(0)
  })

  it('session expiration, cancel và cleanup giới hạn memory', () => {
    const expiring = new ImportSessionService(1, 2)
    const workbook = XLSX.utils.book_new()
    const base = { filePath: 'x', fileName: 'x', fileHash: 'x', workbook, workbookMetadata: { sheetNames: [], fileSize: 0 } }
    expiring.create({ ...base, id: 'one' })
    expect(expiring.cleanupExpired(Date.now() + 2)).toBe(1)
    expiring.create({ ...base, id: 'two' })
    expect(expiring.cancel('two')).toBe(true)
    expect(expiring.size).toBe(0)
  })
})
