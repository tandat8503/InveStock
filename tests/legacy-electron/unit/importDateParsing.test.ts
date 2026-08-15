import { describe, expect, it } from 'vitest'
import { parseImportDate } from '../../electron/utils/dateParsing'

describe('parseImportDate', () => {
  it('hỗ trợ ngày Việt Nam, ISO và serial Excel', () => {
    expect(parseImportDate('27/07/2026')).toBe('2026-07-27')
    expect(parseImportDate('2026-07-27')).toBe('2026-07-27')
    expect(parseImportDate(1)).toBe('1899-12-31')
  })

  it('từ chối ngày và dữ liệu không hợp lệ', () => {
    expect(parseImportDate('31/02/2026')).toBeNull()
    expect(parseImportDate(-1)).toBeNull()
    expect(parseImportDate('abc')).toBeNull()
  })
})
