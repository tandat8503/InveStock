import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyMigrations } from '../../electron/db/connection'

describe('migration v5', () => {
  it('tạo bảng audit import và chạy lặp an toàn', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    applyMigrations(sqlite)
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").pluck().all() as string[]
    expect(tables).toContain('import_jobs')
    expect(tables).toContain('import_job_errors')
    expect(sqlite.prepare('SELECT COUNT(*) FROM schema_migrations WHERE version=5').pluck().get()).toBe(1)
    expect(sqlite.prepare("SELECT value FROM app_settings WHERE key='last_successful_backup_date'").pluck().get()).toBe('')
    sqlite.close()
  })
})
