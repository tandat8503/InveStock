import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { applyMigrations } from '../../electron/db/connection'

describe('migration v2', () => {
  let sqlite: Database.Database | undefined
  afterEach(() => {
    sqlite?.close()
  })

  it('nâng cấp v1 có dữ liệu và chạy lặp an toàn', () => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT);
      INSERT INTO schema_migrations VALUES (1, '2026-01-01');
      CREATE TABLE purchase_invoices (
        id INTEGER PRIMARY KEY, invoice_number TEXT NOT NULL, invoice_date TEXT, status TEXT
      );
      CREATE TABLE inventory_transactions (
        id INTEGER PRIMARY KEY, product_id INTEGER, transaction_date TEXT, stock_after INTEGER NOT NULL
      );
      CREATE TABLE sales_invoices (
        id INTEGER PRIMARY KEY, issue_code TEXT NOT NULL,
        electronic_invoice_number TEXT, invoice_date TEXT, status TEXT
      );
      CREATE TABLE sales_invoice_items (id INTEGER PRIMARY KEY, product_id INTEGER, sales_invoice_id INTEGER);
      CREATE TABLE supplier_payments (id INTEGER PRIMARY KEY, purchase_invoice_id INTEGER, payment_date TEXT);
      CREATE TABLE product_price_history (id INTEGER PRIMARY KEY, product_id INTEGER, changed_at TEXT);
      INSERT INTO purchase_invoices (id,invoice_number) VALUES (1, '00004921');
      INSERT INTO inventory_transactions (id,stock_after) VALUES (1, 7);
    `)
    applyMigrations(sqlite)
    applyMigrations(sqlite)
    const purchaseColumns = sqlite.prepare('PRAGMA table_info(purchase_invoices)').all() as { name: string }[]
    const inventoryColumns = sqlite.prepare('PRAGMA table_info(inventory_transactions)').all() as { name: string }[]
    expect(purchaseColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'payment_status', 'shipping_allocation_method',
    ]))
    expect(inventoryColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'stock_before', 'old_average_cost', 'new_average_cost',
    ]))
    const saleColumns = sqlite.prepare('PRAGMA table_info(sales_invoices)').all() as { name: string }[]
    expect(saleColumns.map((column) => column.name)).toContain('cancellation_reason')
    expect(sqlite.prepare("SELECT value FROM app_counters WHERE name = 'sales_issue_code'").pluck().get()).toBe(0)
    expect(sqlite.prepare('SELECT invoice_number FROM purchase_invoices WHERE id = 1').pluck().get()).toBe('00004921')
    expect(sqlite.prepare('SELECT COUNT(*) FROM schema_migrations WHERE version = 2').pluck().get()).toBe(1)
    expect(sqlite.prepare('SELECT COUNT(*) FROM schema_migrations WHERE version = 3').pluck().get()).toBe(1)
  })
})
