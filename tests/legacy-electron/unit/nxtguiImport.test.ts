import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../electron/db/schema'
import { applyMigrations, setDbForTesting } from '../../electron/db/connection'
import {
  detectNxtguiProfile,
  detectNxtguiPeriod,
  detectNxtguiHeaderRow,
  inferAnimalCategory,
  normalizeNxtguiUnit,
  isNxtguiProductCode,
} from '../../electron/services/import/nxtguiParsingService'
import { parseImportMoney, normalizeImportRow } from '../../electron/services/import/importNormalizationService'
import { ImportExecutionService } from '../../electron/services/import/importExecutionService'
import type { ImportSessionService } from '../../electron/services/import/importSessionService'
import type { ImportSession } from '../../electron/services/import/importModels'
import type * as XLSX from 'xlsx'

interface ExecutableImportService {
  executeNxtguiSummary(session: ImportSession, jobId: number): number
}

interface LegacySummaryDbRow {
  id: number
  import_job_id: number
  product_id: number
  period_label: string
  period_start: string
  period_end: string
  closing_quantity: number
}

interface InventoryTxDbRow {
  id: number
  transaction_date: string
  product_id: number
  transaction_type: string
  quantity_in: number
  quantity_out: number
  unit_cost: number
  stock_after: number
}

describe('NXTGUI Inventory Summary Importer', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    applyMigrations(sqlite)
    const db = drizzle(sqlite, { schema })
    setDbForTesting(db, sqlite)
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('1. Parsing & Helper Functions', () => {
    it('1 & 2. Should detect sheet TH, period info and two-tier header', () => {
      const mockWorkbook = {
        SheetNames: ['TH', 'Sheet2'],
        Sheets: {
          TH: {} as XLSX.WorkSheet,
        },
      } as XLSX.WorkBook

      const profile = detectNxtguiProfile(mockWorkbook, 'NXTGUI.QUI 2-2026 - HUE.xls')
      expect(profile.isNxtgui).toBe(true)
      expect(profile.sheetName).toBe('TH')

      const sampleRows = [
        ['CÔNG TY CỔ PHẦN THỨC ĂN CHĂN NUÔI'],
        ['BÁO CÁO XUẤT NHẬP TỒN Q2/2026'],
        [],
        ['STT', 'MH', 'TÊN HÀNG', 'ĐVT', 'ĐẦU KỲ', '', '', 'NHẬP', '', '', 'XUẤT', '', '', 'TỒN CUỐI KỲ', '', ''],
        ['', '', '', '', 'SL', 'ĐG', 'TT', 'SL', 'ĐG', 'TT', 'SL', 'ĐG', 'TT', 'SL', 'ĐG', 'TT'],
      ]
      const headerRow = detectNxtguiHeaderRow(sampleRows)
      expect(headerRow).toBe(3)

      const period = detectNxtguiPeriod(sampleRows, 'NXTGUI.QUI 2-2026 - HUE.xls')
      expect(period.periodLabel).toBe('Q2/2026')
      expect(period.proposedSnapshotDate).toBe('2026-06-30')
    })

    it('3. Should parse HH00001 code regex correctly', () => {
      expect(isNxtguiProductCode('HH00001')).toBe(true)
      expect(isNxtguiProductCode('hh00123')).toBe(true)
      expect(isNxtguiProductCode('CỘNG')).toBe(false)
      expect(isNxtguiProductCode('TỔNG CỘNG')).toBe(false)
      expect(isNxtguiProductCode('')).toBe(false)
    })

    it('4 & 5 & 6. Should normalize unit and infer animal category correctly', () => {
      expect(normalizeNxtguiUnit('túi')).toBe('Túi')
      expect(normalizeNxtguiUnit('bịch')).toBe('Bịch')
      expect(normalizeNxtguiUnit('bao')).toBe('Bao')
      expect(normalizeNxtguiUnit('Túi')).toBe('Túi')
      expect(normalizeNxtguiUnit('Bịch')).toBe('Bịch')

      expect(inferAnimalCategory('Cám heo con 501')).toBe('heo')
      expect(inferAnimalCategory('Thức ăn lợn nái')).toBe('heo')
      expect(inferAnimalCategory('Cám gà thịt 102')).toBe('ga')
      expect(inferAnimalCategory('Thức ăn vịt đẻ 201')).toBe('vit')
      expect(inferAnimalCategory('Cám nấm siêu nạc')).toBe('vit')
      expect(inferAnimalCategory('Thức ăn bò sữa 301')).toBe('bo')
      expect(inferAnimalCategory('Cám dê vỗ béo')).toBe('de')
      expect(inferAnimalCategory('Phụ gia hỗn hợp')).toBe('khac')
    })

    it('11. Should round decimal money to VND integer', () => {
      expect(parseImportMoney(12345.67)).toBe(12346)
      expect(parseImportMoney('123,456.4')).toBe(123456)
      expect(parseImportMoney(0)).toBe(0)
      expect(parseImportMoney(null)).toBe(0)
    })
  })

  describe('2. Validation Rules & Negative Stock Policy', () => {
    it('8. Should normalize NXTGUI row data correctly', () => {
      const columnIndexes = new Map([
        ['productCode', 1],
        ['productName', 2],
        ['inventoryUnit', 3],
        ['openingQuantity', 4],
        ['openingUnitCost', 5],
        ['openingValue', 6],
        ['purchaseQuantity', 7],
        ['purchaseUnitCost', 8],
        ['purchaseValue', 9],
        ['saleQuantity', 10],
        ['saleUnitCost', 11],
        ['saleValue', 12],
        ['closingQuantity', 13],
        ['closingUnitCost', 14],
        ['closingValue', 15],
      ])

      const rowData = [
        '1', 'HH00001', 'Cám heo con', 'Bao', 10, 100, 1000, 5, 100, 500, 2, 100, 200, 20, 100, 2000
      ]

      const normalized = normalizeImportRow({
        importType: 'nxtgui_inventory_summary',
        row: rowData,
        columnIndexes,
      })

      expect(normalized.productCode).toBe('HH00001')
      expect(normalized.closingQuantity).toBe(20)
      expect(normalized.openingQuantity).toBe(10)
    })

    it('9 & 10. Should handle negative stock input', () => {
      const rowData = [
        '', 'HH00002', 'Cám gà', 'Túi', 0, 0, 0, 0, 0, 0, 5, 100, 500, -5, 100, -500
      ]
      const columnIndexes = new Map([
        ['productCode', 1],
        ['productName', 2],
        ['inventoryUnit', 3],
        ['openingQuantity', 4],
        ['openingUnitCost', 5],
        ['openingValue', 6],
        ['purchaseQuantity', 7],
        ['purchaseUnitCost', 8],
        ['purchaseValue', 9],
        ['saleQuantity', 10],
        ['saleUnitCost', 11],
        ['saleValue', 12],
        ['closingQuantity', 13],
        ['closingUnitCost', 14],
        ['closingValue', 15],
      ])

      const normalized = normalizeImportRow({
        importType: 'nxtgui_inventory_summary',
        row: rowData,
        columnIndexes,
      })

      expect(normalized.closingQuantity).toBe(-5)
    })
  })

  describe('3. Execution Modes (reconcile_only vs initialize_closing_stock)', () => {
    it('12. reconcile_only mode should save legacy_summary but NOT change current_stock', () => {
      sqlite.prepare(`
        INSERT INTO products (product_code, product_name, animal_category, package_weight_grams, package_weight_unit, inventory_unit, current_stock, average_cost, active)
        VALUES ('HH00001', 'Cám heo', 'heo', 25000, 'kg', 'Bao', 50, 100000, 1)
      `).run()

      const jobRes = sqlite.prepare(`
        INSERT INTO import_jobs (import_type, source_filename, source_file_hash, sheet_name, mode, status, started_at)
        VALUES ('nxtgui_inventory_summary', 'NXTGUI.xls', 'hash1', 'TH', 'reconcile_only', 'running', datetime('now'))
      `).run()
      const jobId = Number(jobRes.lastInsertRowid)

      const mockSession: ImportSession = {
        id: 'session-reconcile',
        filePath: '/tmp/test.xls',
        fileName: 'NXTGUI.xls',
        fileHash: 'hash1',
        workbook: {} as XLSX.WorkBook,
        workbookMetadata: { sheetNames: ['TH'], fileSize: 100 },
        headerRow: 4,
        options: { mode: 'reconcile_only', snapshotDate: '2026-06-30' },
        request: {
          importSessionId: 'session-reconcile',
          sheetName: 'TH',
          importType: 'nxtgui_inventory_summary',
          headerRow: 4,
          mappings: [],
          options: { mode: 'reconcile_only', snapshotDate: '2026-06-30' },
        },
        normalizedRows: [
          {
            productCode: 'HH00001',
            productName: 'Cám heo',
            inventoryUnit: 'Bao',
            animalCategory: 'heo',
            openingQuantity: 10,
            openingUnitCost: 100000,
            openingValue: 1000000,
            purchaseQuantity: 20,
            purchaseUnitCost: 100000,
            purchaseValue: 2000000,
            saleQuantity: 5,
            saleUnitCost: 120000,
            saleValue: 600000,
            closingQuantity: 25,
            closingUnitCost: 100000,
            closingValue: 2500000,
          },
        ],
        createdAt: Date.now(),
        expiresAt: Date.now() + 100000,
      }

      const mockSessionService = {
        get: () => mockSession,
        create: () => mockSession,
        cancel: () => true,
        cleanupExpired: () => 0,
      } as unknown as ImportSessionService

      const executionService = new ImportExecutionService(mockSessionService)
      const service = executionService as unknown as ExecutableImportService
      const importedCount = service.executeNxtguiSummary(mockSession, jobId)

      expect(importedCount).toBe(1)

      const product = sqlite.prepare('SELECT current_stock, average_cost FROM products WHERE product_code = ?').get('HH00001') as { current_stock: number; average_cost: number }
      expect(product.current_stock).toBe(50)

      const legacy = sqlite.prepare('SELECT * FROM legacy_inventory_summaries WHERE import_job_id = ?').get(jobId) as LegacySummaryDbRow | undefined
      expect(legacy).toBeDefined()
      expect(legacy?.closing_quantity).toBe(25)

      const txCount = sqlite.prepare('SELECT COUNT(*) as count FROM inventory_transactions').get() as { count: number }
      expect(txCount.count).toBe(0)
    })

    it('13 & 14 & 15 & 16. initialize_closing_stock mode should update stock, averageCost, create legacy_opening transaction, and NOT create invoices', () => {
      const jobRes = sqlite.prepare(`
        INSERT INTO import_jobs (import_type, source_filename, source_file_hash, sheet_name, mode, status, started_at)
        VALUES ('nxtgui_inventory_summary', 'NXTGUI.xls', 'hash2', 'TH', 'initialize_closing_stock', 'running', datetime('now'))
      `).run()
      const jobId = Number(jobRes.lastInsertRowid)

      const mockSession: ImportSession = {
        id: 'session-init',
        filePath: '/tmp/test.xls',
        fileName: 'NXTGUI.xls',
        fileHash: 'hash2',
        workbook: {} as XLSX.WorkBook,
        workbookMetadata: { sheetNames: ['TH'], fileSize: 100 },
        headerRow: 4,
        options: { mode: 'initialize_closing_stock', snapshotDate: '2026-06-30' },
        request: {
          importSessionId: 'session-init',
          sheetName: 'TH',
          importType: 'nxtgui_inventory_summary',
          headerRow: 4,
          mappings: [],
          options: { mode: 'initialize_closing_stock', snapshotDate: '2026-06-30' },
        },
        normalizedRows: [
          {
            productCode: 'HH00002',
            productName: 'Cám gà siêu trứng',
            inventoryUnit: 'Bịch',
            animalCategory: 'ga',
            openingQuantity: 0,
            openingUnitCost: 0,
            openingValue: 0,
            purchaseQuantity: 100,
            purchaseUnitCost: 150000,
            purchaseValue: 15000000,
            saleQuantity: 20,
            saleUnitCost: 180000,
            saleValue: 3600000,
            closingQuantity: 80,
            closingUnitCost: 150000,
            closingValue: 12000000,
          },
        ],
        createdAt: Date.now(),
        expiresAt: Date.now() + 100000,
      }

      const mockSessionService = {
        get: () => mockSession,
        create: () => mockSession,
        cancel: () => true,
        cleanupExpired: () => 0,
      } as unknown as ImportSessionService

      const executionService = new ImportExecutionService(mockSessionService)
      const service = executionService as unknown as ExecutableImportService
      const importedCount = service.executeNxtguiSummary(mockSession, jobId)

      expect(importedCount).toBe(1)

      const product = sqlite.prepare('SELECT current_stock, average_cost, inventory_unit FROM products WHERE product_code = ?').get('HH00002') as { current_stock: number; average_cost: number; inventory_unit: string }
      expect(product.current_stock).toBe(80)
      expect(product.average_cost).toBe(150000)
      expect(product.inventory_unit).toBe('Bịch')

      const tx = sqlite.prepare("SELECT * FROM inventory_transactions WHERE transaction_type = 'legacy_opening'").get() as InventoryTxDbRow | undefined
      expect(tx).toBeDefined()
      expect(tx?.quantity_in).toBe(80)
      expect(tx?.unit_cost).toBe(150000)
      expect(tx?.stock_after).toBe(80)

      const purchaseCount = sqlite.prepare('SELECT COUNT(*) as count FROM purchase_invoices').get() as { count: number }
      const saleCount = sqlite.prepare('SELECT COUNT(*) as count FROM sales_invoices').get() as { count: number }
      expect(purchaseCount.count).toBe(0)
      expect(saleCount.count).toBe(0)
    })

    it('17. Should rollback transaction on error (All-or-nothing)', async () => {
      const mockSession: ImportSession = {
        id: 'session-fail',
        filePath: '/tmp/test.xls',
        fileName: 'NXTGUI.xls',
        fileHash: 'hash-fail',
        workbook: {} as XLSX.WorkBook,
        workbookMetadata: { sheetNames: ['TH'], fileSize: 100 },
        headerRow: 4,
        options: { mode: 'initialize_closing_stock', snapshotDate: '2026-06-30' },
        request: {
          importSessionId: 'session-fail',
          sheetName: 'TH',
          importType: 'nxtgui_inventory_summary',
          headerRow: 4,
          mappings: [],
        },
        validationResult: {
          importSessionId: 'session-fail',
          totalRows: 1,
          validRows: 1,
          warningRows: 0,
          errorRows: 0,
          ignoredRows: 0,
          groupedDocuments: 0,
          errors: [],
          warnings: [],
          normalizedPreview: [],
          canExecute: true,
          detectedDuplicates: [],
          missingProducts: [],
          createdProductsPlan: [],
          summary: 'OK',
        },
        normalizedRows: [
          { productCode: 'HH00099', productName: 'Cám test error' },
        ],
        createdAt: Date.now(),
        expiresAt: Date.now() + 100000,
      }

      const mockSessionService = {
        get: () => mockSession,
        create: () => mockSession,
        cancel: () => true,
        cleanupExpired: () => 0,
      } as unknown as ImportSessionService

      const executionService = new ImportExecutionService(mockSessionService)
      const service = executionService as unknown as ExecutableImportService
      service.executeNxtguiSummary = () => {
        throw new Error('Simulated database error during import')
      }

      await expect(executionService.execute({ importSessionId: 'session-fail' })).rejects.toThrow('Simulated database error during import')

      const product = sqlite.prepare("SELECT * FROM products WHERE product_code = 'HH00099'").get()
      expect(product).toBeUndefined()
    })
  })
})
