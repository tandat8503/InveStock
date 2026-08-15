import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import * as XLSX from 'xlsx'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb, teardownTestDb } from '../helpers/testDatabase'
import { getProductRepository } from '../../electron/repositories/productRepository'
import { ImportParsingService } from '../../electron/services/import/importParsingService'
import { ImportSessionService } from '../../electron/services/import/importSessionService'
import { ImportValidationService } from '../../electron/services/import/importValidationService'
import type { ImportType } from '../../shared/ipc-types'
import { getSqlite } from '../../electron/db/connection'
import { getSaleRepository } from '../../electron/repositories/saleRepository'

describe('Phase 6 import validation', () => {
  let directory: string
  let sessions: ImportSessionService

  beforeEach(() => {
    setupTestDb()
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phase6-validation-'))
    sessions = new ImportSessionService()
  })

  afterEach(() => {
    teardownTestDb()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  function validate(
    importType: ImportType,
    rows: unknown[][],
    mappings: { sourceColumn: string; targetField: string }[],
    options: {
      allowNegativeStock?: boolean
      existingProduct?: 'error' | 'skip' | 'update_non_financial_fields'
      defaultSupplierId?: number
      mode?: 'import_as_draft' | 'import_as_confirmed'
    } = {}
  ) {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Data')
    const filePath = path.join(directory, `${crypto.randomUUID()}.xlsx`)
    XLSX.writeFile(workbook, filePath)
    const parsed = new ImportParsingService(sessions).parseFile(filePath)
    return new ImportValidationService(sessions).validate({
      importSessionId: parsed.importSessionId,
      sheetName: 'Data',
      importType,
      headerRow: 0,
      mappings,
      options,
    })
  }

  it('products: bắt buộc code/name, duplicate file, unit mismatch và giá âm', () => {
    const result = validate('products', [
      ['Code', 'Name', 'Unit', 'Price'],
      ['', '', 'Kg', -1],
      ['SP1', 'A', 'Bao', 1],
      ['SP1', 'B', 'Bao', 1],
    ], [
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Name', targetField: 'productName' },
      { sourceColumn: 'Unit', targetField: 'inventoryUnit' },
      { sourceColumn: 'Price', targetField: 'currentSalePrice' },
    ])
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      'REQUIRED', 'INVALID_UNIT', 'NEGATIVE_PRICE', 'DUPLICATE_PRODUCT_CODE',
    ]))
  })

  it('products: duplicate database error/skip/update và chuẩn hóa Túi/Bịch', async () => {
    await getProductRepository().create({
      productCode: 'SP1', productName: 'Old', animalCategory: 'khac',
      packageWeightGrams: 1, inventoryUnit: 'Bao', currentSalePrice: 1,
    })
    const rows = [['Code', 'Name', 'Unit'], ['SP1', 'New', 'Túi'], ['SP2', 'Two', 'Bịch']]
    const mappings = [
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Name', targetField: 'productName' },
      { sourceColumn: 'Unit', targetField: 'inventoryUnit' },
    ]
    expect(validate('products', rows, mappings).errors.some((error) => error.code === 'DUPLICATE_DATABASE')).toBe(true)
    expect(validate('products', rows, mappings, { existingProduct: 'skip' }).canExecute).toBe(true)
    const update = validate('products', rows, mappings, { existingProduct: 'update_non_financial_fields' })
    expect(update.canExecute).toBe(true)
    expect(update.normalizedPreview.map((row) => row.inventoryUnit)).toEqual(['Tui', 'Bich'])
  })

  it('opening: chặn tồn âm mặc định, cho phép legacy và chặn cost âm/product lạ', async () => {
    await getProductRepository().create({
      productCode: 'SP1', productName: 'One', animalCategory: 'khac',
      packageWeightGrams: 1, inventoryUnit: 'Bao', currentSalePrice: 1,
    })
    const rows = [['Code', 'Qty', 'Cost', 'Date'], ['SP1', -2, 10, '1/1/2026'], ['MISSING', 1, -1, '1/1/2026']]
    const mappings = [
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Qty', targetField: 'quantity' },
      { sourceColumn: 'Cost', targetField: 'unitCost' },
      { sourceColumn: 'Date', targetField: 'openingDate' },
    ]
    const blocked = validate('opening_inventory', rows, mappings)
    expect(blocked.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      'LEGACY_NEGATIVE_STOCK', 'UNKNOWN_PRODUCT', 'INVALID_UNIT_COST',
    ]))
    const allowed = validate('opening_inventory', rows.slice(0, 2), mappings, { allowNegativeStock: true })
    expect(allowed.canExecute).toBe(true)
    expect(allowed.warnings[0].code).toBe('LEGACY_NEGATIVE_STOCK')
  })

  it('opening: chặn sản phẩm đã có ledger', async () => {
    const product = await getProductRepository().create({
      productCode: 'SP1', productName: 'One', animalCategory: 'khac',
      packageWeightGrams: 1, inventoryUnit: 'Bao', currentSalePrice: 1,
    })
    getSqlite().prepare(`
      INSERT INTO inventory_transactions (
        transaction_date, product_id, transaction_type, source_type, source_id,
        quantity_in, quantity_out, unit_cost, stock_after
      ) VALUES ('2026-01-01', ?, 'opening', 'adjustment', 1, 1, 0, 1, 1)
    `).run(product.id)
    const result = validate('opening_inventory', [
      ['Code', 'Qty', 'Cost', 'Date'], ['SP1', 1, 1, '2026-01-01'],
    ], [
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Qty', targetField: 'quantity' },
      { sourceColumn: 'Cost', targetField: 'unitCost' },
      { sourceColumn: 'Date', targetField: 'openingDate' },
    ])
    expect(result.errors.some((error) => error.code === 'PRODUCT_HAS_TRANSACTIONS')).toBe(true)
  })

  it('purchase: giữ số 0, group invoice, tính price từ total và yêu cầu supplier', async () => {
    await getProductRepository().create({
      productCode: 'SP1', productName: 'One', animalCategory: 'khac',
      packageWeightGrams: 1, inventoryUnit: 'Bao', currentSalePrice: 1,
    })
    const rows = [['Inv', 'Date', 'Code', 'Qty', 'Total'], ['0001', '2026-01-01', 'SP1', 2, 20], ['0001', '2026-01-01', 'SP1', 3, 30]]
    const mappings = [
      { sourceColumn: 'Inv', targetField: 'invoiceNumber' },
      { sourceColumn: 'Date', targetField: 'invoiceDate' },
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Qty', targetField: 'quantity' },
      { sourceColumn: 'Total', targetField: 'totalAmount' },
    ]
    const missing = validate('purchase_invoices', rows, mappings)
    expect(missing.errors.some((error) => error.code === 'REQUIRED_SUPPLIER')).toBe(true)
    const valid = validate('purchase_invoices', rows, mappings, { defaultSupplierId: 1 })
    expect(valid.groupedDocuments).toBe(1)
    expect(valid.normalizedPreview[0].invoiceNumber).toBe('0001')
    expect(valid.normalizedPreview[0].unitPrice).toBe(10)
  })

  it('invoice: quantity 0/âm, unknown product, numeric invoice warning và thiếu giá', () => {
    const result = validate('sales_invoices', [
      ['Inv', 'Date', 'Code', 'Qty', 'Price'],
      [4921, '2026-01-01', 'UNKNOWN', 0, null],
      ['2', '2026-01-01', 'UNKNOWN', -1, 5],
    ], [
      { sourceColumn: 'Inv', targetField: 'invoiceNumber' },
      { sourceColumn: 'Date', targetField: 'invoiceDate' },
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Qty', targetField: 'quantity' },
      { sourceColumn: 'Price', targetField: 'unitPrice' },
    ])
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      'UNKNOWN_PRODUCT', 'NON_POSITIVE_QUANTITY', 'MISSING_PRICE',
    ]))
    expect(result.warnings.some((warning) => warning.code === 'NUMERIC_INVOICE_FORMAT')).toBe(true)
  })

  it('sales phát hiện số hóa đơn trùng database', async () => {
    const product = await getProductRepository().create({
      productCode: 'SP1', productName: 'One', animalCategory: 'khac',
      packageWeightGrams: 1, inventoryUnit: 'Bao', currentSalePrice: 1,
    })
    await getSaleRepository().create({
      electronicInvoiceNumber: '0001',
      invoiceDate: '2026-01-01',
      buyerType: 'khach_le',
      items: [{ productId: product.id, quantity: 1, unitSalePrice: 10 }],
    })
    const result = validate('sales_invoices', [
      ['Inv', 'Date', 'Code', 'Qty', 'Price'],
      ['0001', '2026-01-01', 'SP1', 1, 10],
    ], [
      { sourceColumn: 'Inv', targetField: 'invoiceNumber' },
      { sourceColumn: 'Date', targetField: 'invoiceDate' },
      { sourceColumn: 'Code', targetField: 'productCode' },
      { sourceColumn: 'Qty', targetField: 'quantity' },
      { sourceColumn: 'Price', targetField: 'unitPrice' },
    ])
    expect(result.errors.some((error) => error.code === 'DUPLICATE_INVOICE')).toBe(true)
  })
})
