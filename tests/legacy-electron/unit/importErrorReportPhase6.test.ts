import fs from 'fs'
import os from 'os'
import path from 'path'
import * as XLSX from 'xlsx'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { exportImportErrorReport } from '../../electron/services/import/importErrorReportService'

describe('Phase 6 import error report', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phase6-errors-'))

  afterEach(() => {
    for (const filename of fs.readdirSync(directory)) {
      fs.unlinkSync(path.join(directory, filename))
    }
  })
  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }))

  it('xuất đủ cột và giữ original/normalized dạng text', () => {
    const filePath = path.join(directory, 'errors.xlsx')
    exportImportErrorReport({
      importSessionId: 'session',
      totalRows: 1,
      validRows: 0,
      warningRows: 0,
      errorRows: 1,
      ignoredRows: 0,
      groupedDocuments: 1,
      errors: [{
        rowNumber: 2,
        column: 'invoiceNumber',
        code: 'DUPLICATE',
        severity: 'error',
        message: 'Trùng hóa đơn',
        originalValue: '00004921',
        normalizedValue: '00004921',
      }],
      warnings: [],
      normalizedPreview: [],
      canExecute: false,
      detectedDuplicates: ['00004921'],
      missingProducts: [],
      createdProductsPlan: [],
      summary: '1 lỗi',
    }, filePath)
    const workbook = XLSX.readFile(filePath)
    const sheet = workbook.Sheets['Import Errors']
    const originalCell: unknown = sheet['F2']
    const normalizedCell: unknown = sheet['G2']
    expect(originalCell).toMatchObject({ v: '00004921', t: 's' })
    expect(normalizedCell).toMatchObject({ t: 's' })
  })
})
