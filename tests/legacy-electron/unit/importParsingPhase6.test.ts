import fs from 'fs'
import os from 'os'
import path from 'path'
import * as XLSX from 'xlsx'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb, teardownTestDb } from '../helpers/testDatabase'
import { ImportParsingService, detectImportHeader } from '../../electron/services/import/importParsingService'
import { ImportSessionService } from '../../electron/services/import/importSessionService'
import { parseImportDate } from '../../electron/utils/dateParsing'

describe('Phase 6 import parsing', () => {
  let directory: string

  beforeEach(() => {
    setupTestDb()
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phase6-parsing-'))
  })

  afterEach(() => {
    teardownTestDb()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  function writeFixture(extension: 'xlsx' | 'xls' | 'csv', rows: unknown[][]): string {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Data')
    const filePath = path.join(directory, `fixture.${extension}`)
    XLSX.writeFile(workbook, filePath, extension === 'xls' ? { bookType: 'biff8' } : undefined)
    return filePath
  }

  it.each(['xlsx', 'xls', 'csv'] as const)('đọc %s và giữ invoice text có số 0 đầu', (extension) => {
    const filePath = writeFixture(extension, [
      ['Mã sản phẩm', 'Số hóa đơn', 'Ngày'],
      ['SP01', '00004921', '27/7/2026'],
    ])
    const parsed = new ImportParsingService(new ImportSessionService()).parseFile(filePath)
    expect(parsed.sheets[0].detectedHeaderRow).toBe(0)
    expect(parsed.sheets[0].rows[1][1]).toBe('00004921')
  })

  it('phát hiện header dòng 3/4, giữ ô null và lỗi công thức', () => {
    const rows = [
      ['Báo cáo'],
      [null],
      ['Mã sản phẩm', 'Tên sản phẩm', 'ĐVT'],
      ['SP01', '#DIV/0!', null],
    ]
    expect(detectImportHeader(rows)).toBe(2)
    const parsed = new ImportParsingService(new ImportSessionService()).parseFile(
      writeFixture('xlsx', rows)
    )
    expect(parsed.sheets[0].rows[3]).toEqual(['SP01', '#DIV/0!', null])
  })

  it('chọn dòng header tốt nhất trong cấu trúc hai dòng', () => {
    expect(detectImportHeader([
      ['Danh mục', null, 'Số lượng'],
      ['Mã sản phẩm', 'Tên sản phẩm', 'Đơn vị tính'],
    ])).toBe(1)
  })

  it('parse Excel serial, D/M/YYYY, DD/MM/YYYY, ISO và chặn ngày sai', () => {
    expect(parseImportDate(46_500)).toBe('2027-04-23')
    expect(parseImportDate('7/8/2026')).toBe('2026-08-07')
    expect(parseImportDate('07/08/2026')).toBe('2026-08-07')
    expect(parseImportDate('2026-08-07')).toBe('2026-08-07')
    expect(parseImportDate('31/02/2026')).toBeNull()
  })
})
