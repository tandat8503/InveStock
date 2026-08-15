import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { setupTestDb, teardownTestDb } from '../helpers/testDatabase'
import { createReportWorkbook } from '../../electron/services/excelExportService'

describe('Excel report Phase 5', () => {
  beforeEach(() => {
    setupTestDb()
  })
  afterEach(teardownTestDb)
  it('tạo hai sheet và giữ number là number', () => {
    const workbook = createReportWorkbook({
      reportType: 'import_export', filters: { dateFrom: '2026-01-01', dateTo: '2026-01-31' },
    })
    expect(workbook.SheetNames).toEqual(['Tóm tắt', 'Dữ liệu chi tiết'])
    const rows: (string | number)[][] = XLSX.utils.sheet_to_json(workbook.Sheets['Tóm tắt'], { header: 1 })
    expect(rows[1][1]).toBe('2026-01-01')
  })
})
