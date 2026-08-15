import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyMigrations } from '../../electron/db/connection'

describe('migration v4', () => {
  it('tạo index và chạy lặp an toàn', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite); applyMigrations(sqlite)
    const indexes = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index'").pluck().all() as string[]
    expect(indexes).toContain('inventory_transactions_product_date_idx')
    expect(sqlite.prepare('SELECT COUNT(*) FROM schema_migrations WHERE version=4').pluck().get()).toBe(1)
    sqlite.close()
  })
})
