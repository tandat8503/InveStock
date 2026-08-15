import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _sqlite: Database.Database | null = null

export function setDbForTesting(db: ReturnType<typeof drizzle<typeof schema>>, sqlite: Database.Database): void {
  _db = db
  _sqlite = sqlite
}

export function initializeTestDb(): { db: ReturnType<typeof drizzle<typeof schema>>; sqlite: Database.Database } {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  applyMigrations(sqlite)
  const db = drizzle(sqlite, { schema })
  setDbForTesting(db, sqlite)
  return { db, sqlite }
}

export function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'feed-inventory.db')
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db
  throw new Error('Database not initialized. Call initializeDb() first.')
}

export function getSqlite(): Database.Database {
  if (_sqlite) return _sqlite
  throw new Error('SQLite not initialized. Call initializeDb() first.')
}

export function initializeDb(): void {
  const dbPath = getDbPath()
  const dbDir = path.dirname(dbPath)

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // Open database
  _sqlite = new Database(dbPath)

  // Enable WAL mode for better concurrent performance
  _sqlite.pragma('journal_mode = WAL')
  _sqlite.pragma('foreign_keys = ON')
  _sqlite.pragma('synchronous = NORMAL')
  _sqlite.pragma('cache_size = -8000') // 8MB cache
  _sqlite.pragma('temp_store = MEMORY')

  // Create Drizzle instance
  _db = drizzle(_sqlite, { schema })

  // Run migrations from the migrations folder
  const migrationsFolder = path.join(__dirname, 'migrations')
  if (fs.existsSync(migrationsFolder)) {
    migrate(_db, { migrationsFolder })
  }

  // Apply manual migrations if needed
  applyMigrations(_sqlite)
}

export function applyMigrations(sqlite: Database.Database): void {
  // Create schema_migrations table if not exists
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `)

  // Check current version
  const result = sqlite
    .prepare('SELECT MAX(version) as version FROM schema_migrations')
    .get() as { version: number | null }
  const currentVersion = result.version ?? 0

  if (currentVersion < 1) {
    applyMigration1(sqlite)
  }
  if (currentVersion < 2) {
    applyMigration2(sqlite)
  }
  if (currentVersion < 3) {
    applyMigration3(sqlite)
  }
  if (currentVersion < 4) {
    applyMigration4(sqlite)
  }
  if (currentVersion < 5) {
    applyMigration5(sqlite)
  }
  if (currentVersion < 6) {
    applyMigration6(sqlite)
  }
}

function applyMigration6(sqlite: Database.Database): void {
  sqlite.transaction(() => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS legacy_inventory_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_job_id INTEGER NOT NULL REFERENCES import_jobs(id),
        product_id INTEGER REFERENCES products(id),
        period_label TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        opening_quantity INTEGER NOT NULL DEFAULT 0,
        opening_unit_cost INTEGER NOT NULL DEFAULT 0,
        opening_value INTEGER NOT NULL DEFAULT 0,
        purchase_quantity INTEGER NOT NULL DEFAULT 0,
        purchase_unit_cost INTEGER NOT NULL DEFAULT 0,
        purchase_value INTEGER NOT NULL DEFAULT 0,
        sale_quantity INTEGER NOT NULL DEFAULT 0,
        sale_unit_cost INTEGER NOT NULL DEFAULT 0,
        sale_value INTEGER NOT NULL DEFAULT 0,
        closing_quantity INTEGER NOT NULL DEFAULT 0,
        closing_unit_cost INTEGER NOT NULL DEFAULT 0,
        closing_value INTEGER NOT NULL DEFAULT 0,
        source_row_number INTEGER NOT NULL,
        warnings_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE INDEX IF NOT EXISTS legacy_inventory_summaries_job_idx ON legacy_inventory_summaries(import_job_id);
      CREATE INDEX IF NOT EXISTS legacy_inventory_summaries_product_idx ON legacy_inventory_summaries(product_id);
      CREATE INDEX IF NOT EXISTS legacy_inventory_summaries_period_idx ON legacy_inventory_summaries(period_end);
      INSERT OR IGNORE INTO schema_migrations(version) VALUES(6);
    `)
  })()
}

function applyMigration5(sqlite: Database.Database): void {
  sqlite.transaction(() => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS import_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, import_type TEXT NOT NULL,
        source_filename TEXT NOT NULL, source_file_hash TEXT NOT NULL,
        sheet_name TEXT NOT NULL, mode TEXT NOT NULL, total_rows INTEGER NOT NULL DEFAULT 0,
        imported_rows INTEGER NOT NULL DEFAULT 0, warning_rows INTEGER NOT NULL DEFAULT 0,
        error_rows INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, started_at TEXT NOT NULL,
        completed_at TEXT, error_summary TEXT, options_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS import_job_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT, import_job_id INTEGER NOT NULL REFERENCES import_jobs(id),
        row_number INTEGER NOT NULL, column_name TEXT NOT NULL, code TEXT NOT NULL,
        message TEXT NOT NULL, original_value TEXT, severity TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS import_jobs_hash_idx ON import_jobs(source_file_hash);
      CREATE INDEX IF NOT EXISTS import_jobs_started_idx ON import_jobs(started_at);
      CREATE INDEX IF NOT EXISTS import_job_errors_job_idx ON import_job_errors(import_job_id);
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      INSERT OR IGNORE INTO app_settings(key,value) VALUES
        ('last_successful_backup_date',''),('last_backup_file',''),('last_backup_error','');
      INSERT OR IGNORE INTO schema_migrations(version) VALUES(5);
    `)
  })()
}

function applyMigration4(sqlite: Database.Database): void {
  sqlite.transaction(() => {
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS inventory_transactions_product_date_idx ON inventory_transactions(product_id, transaction_date);
      CREATE INDEX IF NOT EXISTS purchase_invoices_date_status_idx ON purchase_invoices(invoice_date, status);
      CREATE INDEX IF NOT EXISTS sales_invoices_date_status_idx ON sales_invoices(invoice_date, status);
      CREATE INDEX IF NOT EXISTS sales_items_product_invoice_idx ON sales_invoice_items(product_id, sales_invoice_id);
      CREATE INDEX IF NOT EXISTS supplier_payments_invoice_date_idx ON supplier_payments(purchase_invoice_id, payment_date);
      CREATE INDEX IF NOT EXISTS price_history_product_changed_idx ON product_price_history(product_id, changed_at);
      INSERT OR IGNORE INTO schema_migrations (version) VALUES (4);
    `)
  })()
}

function applyMigration3(sqlite: Database.Database): void {
  const migration = sqlite.transaction(() => {
    const columns = sqlite.prepare('PRAGMA table_info(sales_invoices)').all() as { name: string }[]
    if (!columns.some((column) => column.name === 'cancellation_reason')) {
      sqlite.exec('ALTER TABLE sales_invoices ADD COLUMN cancellation_reason TEXT')
    }
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS app_counters (
        name TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO app_counters (name, value)
      SELECT 'sales_issue_code',
        COALESCE(MAX(CAST(SUBSTR(issue_code, 3) AS INTEGER)), 0)
      FROM sales_invoices;
      CREATE UNIQUE INDEX IF NOT EXISTS sales_invoice_electronic_number_idx
      ON sales_invoices(electronic_invoice_number)
      WHERE electronic_invoice_number IS NOT NULL;
      INSERT OR IGNORE INTO schema_migrations (version) VALUES (3);
    `)
  })
  migration()
}

function applyMigration2(sqlite: Database.Database): void {
  const columns = sqlite.prepare('PRAGMA table_info(purchase_invoices)').all() as { name: string }[]
  const names = new Set(columns.map((column) => column.name))
  const migration = sqlite.transaction(() => {
    if (!names.has('shipping_allocation_method')) {
      sqlite.exec("ALTER TABLE purchase_invoices ADD COLUMN shipping_allocation_method TEXT NOT NULL DEFAULT 'quantity'")
    }
    if (!names.has('payment_status')) {
      sqlite.exec("ALTER TABLE purchase_invoices ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'chua_thanh_toan'")
    }
    const inventoryColumns = sqlite.prepare('PRAGMA table_info(inventory_transactions)').all() as { name: string }[]
    const inventoryNames = new Set(inventoryColumns.map((column) => column.name))
    if (!inventoryNames.has('old_average_cost')) {
      sqlite.exec('ALTER TABLE inventory_transactions ADD COLUMN old_average_cost INTEGER')
    }
    if (!inventoryNames.has('new_average_cost')) {
      sqlite.exec('ALTER TABLE inventory_transactions ADD COLUMN new_average_cost INTEGER')
    }
    if (!inventoryNames.has('stock_before')) {
      sqlite.exec('ALTER TABLE inventory_transactions ADD COLUMN stock_before INTEGER')
    }
    sqlite.exec('INSERT OR IGNORE INTO schema_migrations (version) VALUES (2)')
  })
  migration()
}

function applyMigration1(sqlite: Database.Database): void {
  const migration = sqlite.transaction(() => {
    sqlite.exec(`
      -- products
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_code TEXT NOT NULL UNIQUE,
        product_name TEXT NOT NULL,
        animal_category TEXT NOT NULL,
        package_weight_grams INTEGER NOT NULL,
        package_weight_unit TEXT NOT NULL DEFAULT 'kg',
        inventory_unit TEXT NOT NULL,
        brand TEXT,
        latest_purchase_price INTEGER NOT NULL DEFAULT 0,
        average_cost INTEGER NOT NULL DEFAULT 0,
        current_sale_price INTEGER NOT NULL DEFAULT 0,
        current_stock INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS products_product_code_idx ON products(product_code);
      CREATE INDEX IF NOT EXISTS products_animal_category_idx ON products(animal_category);
      CREATE INDEX IF NOT EXISTS products_active_idx ON products(active);

      -- suppliers
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        tax_code TEXT,
        contact_person TEXT,
        bank_account TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE INDEX IF NOT EXISTS suppliers_company_name_idx ON suppliers(company_name);

      -- purchase_invoices
      CREATE TABLE IF NOT EXISTS purchase_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_code TEXT NOT NULL UNIQUE,
        invoice_number TEXT NOT NULL,
        invoice_date TEXT NOT NULL,
        received_date TEXT NOT NULL,
        supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
        subtotal INTEGER NOT NULL DEFAULT 0,
        discount_amount INTEGER NOT NULL DEFAULT 0,
        tax_amount INTEGER NOT NULL DEFAULT 0,
        shipping_cost INTEGER NOT NULL DEFAULT 0,
        grand_total INTEGER NOT NULL DEFAULT 0,
        paid_amount INTEGER NOT NULL DEFAULT 0,
        remaining_amount INTEGER NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT 'chuyen_khoan',
        status TEXT NOT NULL DEFAULT 'nhap',
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        confirmed_at TEXT,
        cancelled_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS purchase_invoices_receipt_code_idx ON purchase_invoices(receipt_code);
      CREATE INDEX IF NOT EXISTS purchase_invoices_supplier_id_idx ON purchase_invoices(supplier_id);
      CREATE INDEX IF NOT EXISTS purchase_invoices_status_idx ON purchase_invoices(status);
      CREATE INDEX IF NOT EXISTS purchase_invoices_invoice_date_idx ON purchase_invoices(invoice_date);

      -- purchase_invoice_items
      CREATE TABLE IF NOT EXISTS purchase_invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        invoice_unit_price INTEGER NOT NULL,
        discount_amount INTEGER NOT NULL DEFAULT 0,
        shipping_allocation INTEGER NOT NULL DEFAULT 0,
        effective_unit_cost INTEGER NOT NULL,
        line_total INTEGER NOT NULL,
        notes TEXT
      );

      CREATE INDEX IF NOT EXISTS purchase_invoice_items_invoice_id_idx ON purchase_invoice_items(purchase_invoice_id);
      CREATE INDEX IF NOT EXISTS purchase_invoice_items_product_id_idx ON purchase_invoice_items(product_id);

      -- supplier_payments
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id),
        payment_date TEXT NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'chuyen_khoan',
        transaction_reference TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE INDEX IF NOT EXISTS supplier_payments_invoice_id_idx ON supplier_payments(purchase_invoice_id);
      CREATE INDEX IF NOT EXISTS supplier_payments_payment_date_idx ON supplier_payments(payment_date);

      -- sales_invoices
      CREATE TABLE IF NOT EXISTS sales_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_code TEXT NOT NULL UNIQUE,
        electronic_invoice_number TEXT,
        invoice_date TEXT NOT NULL,
        buyer_type TEXT NOT NULL DEFAULT 'khach_le',
        buyer_name TEXT,
        subtotal INTEGER NOT NULL DEFAULT 0,
        grand_total INTEGER NOT NULL DEFAULT 0,
        total_cost INTEGER NOT NULL DEFAULT 0,
        estimated_profit INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'nhap',
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        confirmed_at TEXT,
        cancelled_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS sales_invoices_issue_code_idx ON sales_invoices(issue_code);
      CREATE INDEX IF NOT EXISTS sales_invoices_status_idx ON sales_invoices(status);
      CREATE INDEX IF NOT EXISTS sales_invoices_invoice_date_idx ON sales_invoices(invoice_date);

      -- sales_invoice_items
      CREATE TABLE IF NOT EXISTS sales_invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sales_invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        unit_sale_price INTEGER NOT NULL,
        unit_cost_at_sale INTEGER NOT NULL,
        line_revenue INTEGER NOT NULL,
        line_cost INTEGER NOT NULL,
        estimated_profit INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS sales_invoice_items_invoice_id_idx ON sales_invoice_items(sales_invoice_id);
      CREATE INDEX IF NOT EXISTS sales_invoice_items_product_id_idx ON sales_invoice_items(product_id);

      -- inventory_transactions
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_date TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id),
        transaction_type TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        quantity_in INTEGER NOT NULL DEFAULT 0,
        quantity_out INTEGER NOT NULL DEFAULT 0,
        unit_cost INTEGER NOT NULL DEFAULT 0,
        stock_after INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE INDEX IF NOT EXISTS inventory_transactions_product_id_idx ON inventory_transactions(product_id);
      CREATE INDEX IF NOT EXISTS inventory_transactions_date_idx ON inventory_transactions(transaction_date);
      CREATE INDEX IF NOT EXISTS inventory_transactions_source_idx ON inventory_transactions(source_type, source_id);

      -- product_price_history
      CREATE TABLE IF NOT EXISTS product_price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id),
        price_type TEXT NOT NULL DEFAULT 'sale_price',
        old_price INTEGER NOT NULL,
        new_price INTEGER NOT NULL,
        changed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        reason TEXT
      );

      CREATE INDEX IF NOT EXISTS product_price_history_product_id_idx ON product_price_history(product_id);
      CREATE INDEX IF NOT EXISTS product_price_history_changed_at_idx ON product_price_history(changed_at);

      -- attachments
      CREATE TABLE IF NOT EXISTS attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        original_filename TEXT NOT NULL,
        stored_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE INDEX IF NOT EXISTS attachments_entity_idx ON attachments(entity_type, entity_id);

      -- app_settings
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      -- Insert default settings
      INSERT OR IGNORE INTO app_settings (key, value) VALUES
        ('store_name', 'Cửa hàng thức ăn chăn nuôi'),
        ('tax_code', ''),
        ('address', ''),
        ('phone', ''),
        ('currency', 'VND'),
        ('backup_folder', ''),
        ('automatic_backup_enabled', 'false'),
        ('backup_retention_count', '10');

      INSERT INTO schema_migrations (version) VALUES (1);
    `)
  })

  migration()
}

export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
    _db = null
  }
}
