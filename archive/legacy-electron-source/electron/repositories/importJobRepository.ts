import type {
  ImportJobDTO,
  ImportValidationError,
  ImportValidationWarning,
} from '../../shared/ipc-types'
import { getSqlite } from '../db/connection'

type ImportIssue = ImportValidationError | ImportValidationWarning

export interface StartImportJobInput {
  importType: string
  sourceFilename: string
  sourceFileHash: string
  sheetName: string
  mode: string
  totalRows: number
  warningRows: number
  errorRows: number
  options: object
}

export class ImportJobRepository {
  start(input: StartImportJobInput): number {
    const result = getSqlite().prepare(`
      INSERT INTO import_jobs (
        import_type, source_filename, source_file_hash, sheet_name, mode,
        total_rows, warning_rows, error_rows, status, started_at, options_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)
    `).run(
      input.importType,
      input.sourceFilename,
      input.sourceFileHash,
      input.sheetName,
      input.mode,
      input.totalRows,
      input.warningRows,
      input.errorRows,
      new Date().toISOString(),
      JSON.stringify(input.options)
    )
    return Number(result.lastInsertRowid)
  }

  succeed(id: number, importedRows: number): void {
    getSqlite().prepare(`
      UPDATE import_jobs
      SET imported_rows = ?, status = 'success', completed_at = ?
      WHERE id = ?
    `).run(importedRows, new Date().toISOString(), id)
  }

  fail(id: number, failure: unknown, issues: ImportIssue[]): void {
    const sqlite = getSqlite()
    sqlite.prepare(`
      UPDATE import_jobs
      SET status = 'failed', completed_at = ?, error_summary = ?, error_rows = ?
      WHERE id = ?
    `).run(
      new Date().toISOString(),
      failure instanceof Error ? failure.message : String(failure),
      new Set(issues.filter((issue) => issue.severity === 'error').map((issue) => issue.rowNumber)).size,
      id
    )
    const statement = sqlite.prepare(`
      INSERT INTO import_job_errors (
        import_job_id, row_number, column_name, code, message, original_value, severity
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    sqlite.transaction(() => {
      for (const issue of issues) {
        statement.run(
          id,
          issue.rowNumber,
          issue.column,
          issue.code,
          issue.message,
          issue.originalValue === undefined ? null : String(issue.originalValue),
          issue.severity
        )
      }
    })()
  }

  list(limit = 100): ImportJobDTO[] {
    return getSqlite().prepare(`
      SELECT
        id, import_type AS importType, source_filename AS sourceFilename,
        source_file_hash AS sourceFileHash, sheet_name AS sheetName, mode,
        total_rows AS totalRows, imported_rows AS importedRows,
        warning_rows AS warningRows, error_rows AS errorRows, status,
        started_at AS startedAt, completed_at AS completedAt, error_summary AS errorSummary
      FROM import_jobs ORDER BY id DESC LIMIT ?
    `).all(limit) as ImportJobDTO[]
  }
}

export const importJobRepository = new ImportJobRepository()
