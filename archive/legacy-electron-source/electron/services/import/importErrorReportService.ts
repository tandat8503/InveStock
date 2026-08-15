import * as XLSX from 'xlsx'
import type { ImportValidationResult } from '../../../shared/ipc-types'

export function exportImportErrorReport(
  validation: ImportValidationResult,
  filePath: string
): string {
  const rows = [...validation.errors, ...validation.warnings].map((issue) => ({
    'Row number': issue.rowNumber,
    Column: issue.column,
    'Error code': issue.code,
    Severity: issue.severity,
    Message: issue.message,
    'Original value': issue.originalValue === undefined ? '' : String(issue.originalValue),
    'Normalized value': issue.normalizedValue === undefined ? '' : String(issue.normalizedValue),
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  for (let row = 2; row <= rows.length + 1; row += 1) {
    for (const column of ['F', 'G']) {
      const cell: unknown = sheet[`${column}${row}`]
      if (cell && typeof cell === 'object' && 't' in cell) {
        const typedCell = cell as XLSX.CellObject
        typedCell.t = 's'
      }
    }
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Import Errors')
  XLSX.writeFile(workbook, filePath)
  return filePath
}
