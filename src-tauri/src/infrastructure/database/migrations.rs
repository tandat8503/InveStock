use rusqlite::{Connection, OptionalExtension, Result};

pub const LATEST_SCHEMA_VERSION: i64 = 12;

pub fn requires_pre_migration_backup(schema_version: i64) -> bool {
    schema_version > 0 && schema_version < LATEST_SCHEMA_VERSION
}

pub fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        ",
    )?;

    let mut stmt = conn.prepare("SELECT MAX(version) FROM schema_migrations")?;
    let current_version: i64 = stmt.query_row([], |row| row.get(0)).unwrap_or(0);

    if current_version < 1 {
        apply_migration_1(conn)?;
    }
    if current_version < 2 {
        apply_migration_2(conn)?;
    }
    if current_version < 3 {
        apply_migration_3(conn)?;
    }
    if current_version < 4 {
        apply_migration_4(conn)?;
    }
    if current_version < 5 {
        apply_migration_5(conn)?;
    }
    if current_version < 6 {
        apply_migration_6(conn)?;
    }
    if current_version < 7 {
        apply_migration_7(conn)?;
    }
    if current_version < 8 {
        apply_migration_8(conn)?;
    }
    if current_version < 9 {
        apply_migration_9(conn)?;
    }
    if current_version < 10 {
        apply_migration_10(conn)?;
    }
    if current_version < 11 {
        apply_migration_11(conn)?;
    }
    if current_version < 12 {
        apply_migration_12(conn)?;
    }

    Ok(())
}

fn apply_migration_10(conn: &Connection) -> Result<()> {
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION;")?;
    let result = (|| {
        add_column_if_missing(conn, "import_jobs", "dataset_hash", "TEXT")?;
        add_column_if_missing(
            conn,
            "import_jobs",
            "revision",
            "INTEGER NOT NULL DEFAULT 1",
        )?;
        add_column_if_missing(
            conn,
            "purchase_invoice_items",
            "inventory_cost_value",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        conn.execute_batch(
            "UPDATE import_jobs SET dataset_hash=source_file_hash WHERE dataset_hash IS NULL OR dataset_hash='';
             UPDATE purchase_invoice_items
                SET inventory_cost_value=line_total
              WHERE inventory_cost_value=0 AND line_total<>0;
             DROP INDEX IF EXISTS idx_legacy_inventory_period_product;
             DROP INDEX IF EXISTS idx_legacy_inventory_batch_row;
             DROP INDEX IF EXISTS idx_import_jobs_source_period;
             CREATE UNIQUE INDEX IF NOT EXISTS idx_legacy_inventory_revision_product
                 ON legacy_inventory_summaries(import_job_id,product_id,period_start,period_end);
             CREATE UNIQUE INDEX IF NOT EXISTS idx_legacy_inventory_revision_row
                 ON legacy_inventory_summaries(import_job_id,source_row_number);
             CREATE UNIQUE INDEX IF NOT EXISTS idx_import_jobs_dataset_period
                 ON import_jobs(source_file_hash,dataset_hash,revision,period_start,period_end)
                 WHERE superseded_by IS NULL;
             INSERT OR IGNORE INTO schema_migrations(version) VALUES(10);",
        )
    })();
    match result {
        Ok(()) => conn.execute_batch("COMMIT;"),
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK;");
            Err(error)
        }
    }
}

fn apply_migration_9(conn: &Connection) -> Result<()> {
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION;")?;
    let result = (|| {
        add_column_if_missing(
            conn,
            "products",
            "current_inventory_value",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        add_column_if_missing(conn, "products", "low_stock_threshold_override", "INTEGER")?;
        add_column_if_missing(
            conn,
            "inventory_transactions",
            "value_in",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        add_column_if_missing(
            conn,
            "inventory_transactions",
            "value_out",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        add_column_if_missing(
            conn,
            "inventory_transactions",
            "inventory_value_before",
            "INTEGER",
        )?;
        add_column_if_missing(
            conn,
            "inventory_transactions",
            "inventory_value_after",
            "INTEGER",
        )?;
        add_column_if_missing(conn, "import_jobs", "batch_key", "TEXT")?;
        add_column_if_missing(conn, "import_jobs", "period_start", "TEXT")?;
        add_column_if_missing(conn, "import_jobs", "period_end", "TEXT")?;
        add_column_if_missing(conn, "import_jobs", "data_granularity", "TEXT")?;
        add_column_if_missing(conn, "import_jobs", "cutover_date", "TEXT")?;
        add_column_if_missing(
            conn,
            "import_jobs",
            "establishes_inventory_baseline",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        add_column_if_missing(conn, "import_jobs", "sale_value_semantics", "TEXT")?;
        add_column_if_missing(
            conn,
            "import_jobs",
            "has_revenue_data",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        add_column_if_missing(
            conn,
            "import_jobs",
            "has_invoice_detail",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        add_column_if_missing(conn, "import_jobs", "superseded_by", "INTEGER")?;

        conn.execute_batch(
            "UPDATE legacy_inventory_summaries
                SET closing_unit_cost=CAST(ROUND(ABS(CAST(closing_value AS REAL)/closing_quantity)) AS INTEGER),
                    derived_closing_unit_cost=1
              WHERE closing_unit_cost=0 AND closing_quantity<>0 AND closing_value<>0;
             UPDATE import_jobs SET
                batch_key=COALESCE(batch_key,(SELECT import_batch_id FROM legacy_inventory_summaries WHERE import_job_id=import_jobs.id LIMIT 1)),
                period_start=COALESCE(period_start,(SELECT MIN(period_start) FROM legacy_inventory_summaries WHERE import_job_id=import_jobs.id)),
                period_end=COALESCE(period_end,(SELECT MAX(period_end) FROM legacy_inventory_summaries WHERE import_job_id=import_jobs.id)),
                cutover_date=COALESCE(cutover_date,(SELECT MAX(period_end) FROM legacy_inventory_summaries WHERE import_job_id=import_jobs.id)),
                data_granularity=COALESCE(data_granularity,'quarter_summary'),
                establishes_inventory_baseline=CASE WHEN EXISTS(SELECT 1 FROM legacy_inventory_summaries WHERE import_job_id=import_jobs.id) THEN 1 ELSE establishes_inventory_baseline END,
                sale_value_semantics=COALESCE(sale_value_semantics,'cogs'),
                has_revenue_data=0,
                has_invoice_detail=0
              WHERE EXISTS(SELECT 1 FROM legacy_inventory_summaries WHERE import_job_id=import_jobs.id);
             UPDATE inventory_transactions SET
                value_in=CASE WHEN transaction_type IN ('legacy_opening','opening_balance') THEN 0 ELSE quantity_in*unit_cost END,
                value_out=CASE WHEN transaction_type IN ('legacy_opening','opening_balance') THEN 0 ELSE quantity_out*unit_cost END;
             UPDATE inventory_transactions SET
                transaction_type='opening_balance', quantity_in=0, quantity_out=0, value_in=0, value_out=0,
                inventory_value_before=NULL,
                inventory_value_after=(SELECT closing_value FROM legacy_inventory_summaries l WHERE l.product_id=inventory_transactions.product_id AND l.period_end=inventory_transactions.transaction_date ORDER BY l.id DESC LIMIT 1)
              WHERE transaction_type='legacy_opening';
             UPDATE products SET
                current_inventory_value=COALESCE((SELECT l.closing_value FROM legacy_inventory_summaries l JOIN import_jobs j ON j.id=l.import_job_id WHERE l.product_id=products.id AND j.establishes_inventory_baseline=1 AND j.superseded_by IS NULL ORDER BY j.cutover_date DESC,l.id DESC LIMIT 1),0)
                +COALESCE((SELECT SUM(t.value_in-t.value_out) FROM inventory_transactions t WHERE t.product_id=products.id AND t.transaction_type<>'opening_balance' AND t.transaction_date>COALESCE((SELECT MAX(j.cutover_date) FROM legacy_inventory_summaries l JOIN import_jobs j ON j.id=l.import_job_id WHERE l.product_id=products.id AND j.establishes_inventory_baseline=1 AND j.superseded_by IS NULL),'0000-01-01')),0);
             UPDATE products SET average_cost=CASE WHEN current_stock<>0 THEN CAST(ROUND(ABS(CAST(current_inventory_value AS REAL)/current_stock)) AS INTEGER) ELSE 0 END;
             CREATE INDEX IF NOT EXISTS idx_import_jobs_period ON import_jobs(period_start,period_end,cutover_date);
             CREATE UNIQUE INDEX IF NOT EXISTS idx_import_jobs_source_period ON import_jobs(source_file_hash,period_start,period_end) WHERE superseded_by IS NULL;
             INSERT OR IGNORE INTO schema_migrations(version) VALUES(9);",
        )?;
        repair_inventory_value_states(conn)
    })();
    match result {
        Ok(()) => conn.execute_batch("COMMIT;"),
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK;");
            Err(error)
        }
    }
}

fn repair_inventory_value_states(conn: &Connection) -> Result<()> {
    let mut product_statement = conn.prepare(
        "SELECT p.id,
                COALESCE((SELECT l.closing_value FROM legacy_inventory_summaries l JOIN import_jobs j ON j.id=l.import_job_id WHERE l.product_id=p.id AND j.establishes_inventory_baseline=1 AND j.superseded_by IS NULL ORDER BY j.cutover_date DESC LIMIT 1),0),
                COALESCE((SELECT MAX(j.cutover_date) FROM legacy_inventory_summaries l JOIN import_jobs j ON j.id=l.import_job_id WHERE l.product_id=p.id AND j.establishes_inventory_baseline=1 AND j.superseded_by IS NULL),'0000-01-01')
         FROM products p",
    )?;
    let products = product_statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>>>()?;
    for (product_id, mut inventory_value, cutover_date) in products {
        let mut transaction_statement = conn.prepare(
            "SELECT id,value_in,value_out FROM inventory_transactions
             WHERE product_id=?1 AND transaction_type<>'opening_balance' AND transaction_date>?2
             ORDER BY transaction_date,id",
        )?;
        let transactions = transaction_statement
            .query_map(rusqlite::params![product_id, cutover_date], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>>>()?;
        for (transaction_id, value_in, value_out) in transactions {
            let before = inventory_value;
            inventory_value += value_in - value_out;
            conn.execute(
                "UPDATE inventory_transactions SET inventory_value_before=?1,inventory_value_after=?2 WHERE id=?3",
                rusqlite::params![before, inventory_value, transaction_id],
            )?;
        }
    }
    Ok(())
}

fn apply_migration_8(conn: &Connection) -> Result<()> {
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION;")?;
    let result = (|| {
        add_column_if_missing(
            conn,
            "products",
            "package_weight_known",
            "INTEGER NOT NULL DEFAULT 1",
        )?;
        add_column_if_missing(
            conn,
            "products",
            "latest_purchase_price_known",
            "INTEGER NOT NULL DEFAULT 1",
        )?;
        add_column_if_missing(
            conn,
            "legacy_inventory_summaries",
            "source_file_name",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        add_column_if_missing(
            conn,
            "legacy_inventory_summaries",
            "import_batch_id",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        add_column_if_missing(
            conn,
            "legacy_inventory_summaries",
            "source_type",
            "TEXT NOT NULL DEFAULT 'legacy_excel'",
        )?;
        add_column_if_missing(conn, "legacy_inventory_summaries", "notes", "TEXT")?;
        add_column_if_missing(
            conn,
            "legacy_inventory_summaries",
            "derived_closing_unit_cost",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        conn.execute_batch(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_legacy_inventory_period_product
                 ON legacy_inventory_summaries(product_id, period_start, period_end);
             CREATE UNIQUE INDEX IF NOT EXISTS idx_legacy_inventory_batch_row
                 ON legacy_inventory_summaries(import_batch_id, source_row_number);
             INSERT OR IGNORE INTO schema_migrations (version) VALUES (8);",
        )
    })();
    match result {
        Ok(()) => conn.execute_batch("COMMIT;"),
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK;");
            Err(error)
        }
    }
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    declaration: &str,
) -> Result<()> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
    for existing in columns {
        if existing? == column {
            return Ok(());
        }
    }
    conn.execute_batch(&format!(
        "ALTER TABLE {table} ADD COLUMN {column} {declaration}"
    ))
}

fn apply_migration_1(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        BEGIN TRANSACTION;

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_code TEXT NOT NULL UNIQUE,
            product_name TEXT NOT NULL,
            animal_category TEXT NOT NULL,
            package_weight_grams INTEGER NOT NULL DEFAULT 0,
            package_weight_unit TEXT NOT NULL DEFAULT 'kg',
            inventory_unit TEXT NOT NULL,
            brand TEXT,
            latest_purchase_price INTEGER NOT NULL DEFAULT 0,
            average_cost INTEGER NOT NULL DEFAULT 0,
            current_sale_price INTEGER NOT NULL DEFAULT 0,
            current_stock INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

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
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

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
            shipping_allocation_method TEXT NOT NULL DEFAULT 'quantity',
            grand_total INTEGER NOT NULL DEFAULT 0,
            paid_amount INTEGER NOT NULL DEFAULT 0,
            remaining_amount INTEGER NOT NULL DEFAULT 0,
            payment_status TEXT NOT NULL DEFAULT 'chua_thanh_toan',
            payment_method TEXT NOT NULL DEFAULT 'chuyen_khoan',
            status TEXT NOT NULL DEFAULT 'nhap',
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            confirmed_at TEXT,
            cancelled_at TEXT
        );

        CREATE TABLE IF NOT EXISTS purchase_invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL REFERENCES products(id),
            quantity INTEGER NOT NULL,
            invoice_unit_price INTEGER NOT NULL,
            discount_amount INTEGER NOT NULL DEFAULT 0,
            shipping_allocation INTEGER NOT NULL DEFAULT 0,
            effective_unit_cost INTEGER NOT NULL,
            line_total INTEGER NOT NULL,
            notes TEXT
        );

        INSERT INTO schema_migrations (version) VALUES (1);
        COMMIT;
        ",
    )
}

fn apply_migration_2(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        BEGIN TRANSACTION;

        CREATE TABLE IF NOT EXISTS supplier_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id),
            payment_date TEXT NOT NULL,
            amount INTEGER NOT NULL,
            payment_method TEXT NOT NULL DEFAULT 'chuyen_khoan',
            transaction_reference TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

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
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            confirmed_at TEXT,
            cancelled_at TEXT,
            cancellation_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS sales_invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sales_invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL REFERENCES products(id),
            quantity INTEGER NOT NULL,
            unit_sale_price INTEGER NOT NULL,
            unit_cost_at_sale INTEGER NOT NULL,
            line_revenue INTEGER NOT NULL,
            line_cost INTEGER NOT NULL,
            estimated_profit INTEGER NOT NULL
        );

        INSERT INTO schema_migrations (version) VALUES (2);
        COMMIT;
        ",
    )
}

fn apply_migration_3(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        BEGIN TRANSACTION;

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
            stock_before INTEGER,
            stock_after INTEGER NOT NULL,
            old_average_cost INTEGER,
            new_average_cost INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS product_price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL REFERENCES products(id),
            price_type TEXT NOT NULL DEFAULT 'sale_price',
            old_price INTEGER NOT NULL,
            new_price INTEGER NOT NULL,
            changed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            reason TEXT
        );

        INSERT INTO schema_migrations (version) VALUES (3);
        COMMIT;
        ",
    )
}

fn apply_migration_4(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        BEGIN TRANSACTION;

        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            original_filename TEXT NOT NULL,
            stored_filename TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        INSERT INTO schema_migrations (version) VALUES (4);
        COMMIT;
        ",
    )
}

fn apply_migration_5(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        BEGIN TRANSACTION;

        CREATE TABLE IF NOT EXISTS import_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_type TEXT NOT NULL,
            source_filename TEXT NOT NULL,
            source_file_hash TEXT NOT NULL,
            sheet_name TEXT NOT NULL,
            mode TEXT NOT NULL,
            total_rows INTEGER NOT NULL DEFAULT 0,
            imported_rows INTEGER NOT NULL DEFAULT 0,
            warning_rows INTEGER NOT NULL DEFAULT 0,
            error_rows INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            error_summary TEXT,
            options_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS import_job_errors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_job_id INTEGER NOT NULL REFERENCES import_jobs(id),
            row_number INTEGER NOT NULL,
            column_name TEXT NOT NULL,
            code TEXT NOT NULL,
            message TEXT NOT NULL,
            original_value TEXT,
            severity TEXT NOT NULL
        );

        INSERT INTO schema_migrations (version) VALUES (5);
        COMMIT;
        ",
    )
}

fn apply_migration_6(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        BEGIN TRANSACTION;

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
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        INSERT INTO schema_migrations (version) VALUES (6);
        COMMIT;
        ",
    )
}

fn apply_migration_7(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        BEGIN TRANSACTION;

        CREATE TABLE IF NOT EXISTS document_sequences (
            document_type TEXT PRIMARY KEY,
            next_value INTEGER NOT NULL CHECK(next_value > 0)
        );

        INSERT OR IGNORE INTO document_sequences(document_type, next_value)
        SELECT 'purchase', COALESCE(MAX(CAST(SUBSTR(receipt_code, 3) AS INTEGER)), 0) + 1
        FROM purchase_invoices;

        INSERT OR IGNORE INTO document_sequences(document_type, next_value)
        SELECT 'sale', COALESCE(MAX(CAST(SUBSTR(issue_code, 3) AS INTEGER)), 0) + 1
        FROM sales_invoices;

        CREATE INDEX IF NOT EXISTS idx_purchase_invoices_invoice_date ON purchase_invoices(invoice_date);
        CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_id ON purchase_invoices(supplier_id);
        CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status ON purchase_invoices(status);
        CREATE INDEX IF NOT EXISTS idx_sales_invoices_invoice_date ON sales_invoices(invoice_date);
        CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON sales_invoices(status);
        CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product_date ON inventory_transactions(product_id, transaction_date);
        CREATE INDEX IF NOT EXISTS idx_inventory_transactions_source ON inventory_transactions(source_type, source_id);
        CREATE INDEX IF NOT EXISTS idx_supplier_payments_invoice_date ON supplier_payments(purchase_invoice_id, payment_date);

        INSERT INTO schema_migrations (version) VALUES (7);
        COMMIT;
        ",
    )
}

fn apply_migration_11(conn: &Connection) -> Result<()> {
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION;")?;
    let result = (|| {
        add_column_if_missing(conn, "purchase_invoices", "cancellation_reason", "TEXT")?;
        add_column_if_missing(
            conn,
            "supplier_payments",
            "status",
            "TEXT NOT NULL DEFAULT 'active'",
        )?;
        add_column_if_missing(conn, "supplier_payments", "voided_at", "TEXT")?;
        add_column_if_missing(conn, "supplier_payments", "void_reason", "TEXT")?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS inventory_adjustments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL REFERENCES products(id),
                system_stock INTEGER NOT NULL,
                actual_stock INTEGER NOT NULL,
                difference INTEGER NOT NULL,
                reason TEXT NOT NULL,
                notes TEXT,
                adjustment_date TEXT NOT NULL,
                adjustment_unit_cost INTEGER,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
             );
             CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_date ON inventory_adjustments(adjustment_date);
             INSERT OR IGNORE INTO schema_migrations(version) VALUES(11);"
        )
    })();
    match result {
        Ok(()) => conn.execute_batch("COMMIT;"),
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK;");
            Err(error)
        }
    }
}

fn rounded_absolute_cost(value: i64, stock: i64) -> i64 {
    if stock == 0 {
        return 0;
    }
    let numerator = i128::from(value).abs();
    let denominator = i128::from(stock).abs();
    ((numerator + denominator / 2) / denominator) as i64
}

fn migration_12_error(message: String) -> rusqlite::Error {
    rusqlite::Error::InvalidParameterName(message)
}

/// Reconciles only snapshots for which an exact monetary source can be proven.
/// Unknown values intentionally remain zero and are reported by the health check/UI.
fn apply_migration_12(conn: &Connection) -> Result<()> {
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION;")?;
    let result = (|| {
        let mut product_statement = conn.prepare(
            "SELECT id,product_code,current_stock,current_inventory_value FROM products ORDER BY id",
        )?;
        let products = product_statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>>>()?;

        for (product_id, product_code, snapshot_stock, snapshot_value) in products {
            if snapshot_stock == 0 {
                conn.execute(
                    "UPDATE products SET current_inventory_value=0,average_cost=0 WHERE id=?1",
                    [product_id],
                )?;
                continue;
            }
            if snapshot_value != 0 {
                conn.execute(
                    "UPDATE products SET average_cost=?1 WHERE id=?2",
                    rusqlite::params![
                        rounded_absolute_cost(snapshot_value, snapshot_stock),
                        product_id
                    ],
                )?;
                continue;
            }

            let baseline: Option<(i64, i64, String, i64)> = conn
                .query_row(
                    "SELECT l.closing_quantity,l.closing_value,j.cutover_date,j.id
                       FROM legacy_inventory_summaries l
                       JOIN import_jobs j ON j.id=l.import_job_id
                      WHERE l.product_id=?1 AND j.establishes_inventory_baseline=1
                        AND j.superseded_by IS NULL AND l.closing_value<>0
                      ORDER BY j.cutover_date DESC,l.id DESC LIMIT 1",
                    [product_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .optional()?;

            let repaired = if let Some((mut stock, mut value, cutover, import_job_id)) = baseline {
                // Only legacy-import opening rows linked to the authoritative job are repaired.
                conn.execute(
                    "UPDATE inventory_transactions
                        SET stock_after=?1,inventory_value_after=?2,
                            new_average_cost=?3,unit_cost=?3
                      WHERE product_id=?4 AND source_type='legacy_import' AND source_id=?5
                        AND transaction_type IN ('opening_balance','legacy_opening')",
                    rusqlite::params![
                        stock,
                        value,
                        rounded_absolute_cost(value, stock),
                        product_id,
                        import_job_id
                    ],
                )?;

                let mut tx_statement = conn.prepare(
                    "SELECT id,quantity_in,quantity_out,value_in,value_out
                       FROM inventory_transactions
                      WHERE product_id=?1 AND transaction_date>?2
                        AND transaction_type NOT IN ('opening_balance','legacy_opening')
                      ORDER BY transaction_date ASC,id ASC",
                )?;
                let transactions = tx_statement
                    .query_map(rusqlite::params![product_id, cutover], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, i64>(2)?,
                            row.get::<_, i64>(3)?,
                            row.get::<_, i64>(4)?,
                        ))
                    })?
                    .collect::<Result<Vec<_>>>()?;
                for (transaction_id, quantity_in, quantity_out, value_in, value_out) in transactions
                {
                    let stock_before = stock;
                    let value_before = value;
                    stock += quantity_in - quantity_out;
                    value += value_in - value_out;
                    conn.execute(
                        "UPDATE inventory_transactions SET stock_before=?1,stock_after=?2,
                                inventory_value_before=?3,inventory_value_after=?4,
                                old_average_cost=?5,new_average_cost=?6 WHERE id=?7",
                        rusqlite::params![
                            stock_before,
                            stock,
                            value_before,
                            value,
                            rounded_absolute_cost(value_before, stock_before),
                            rounded_absolute_cost(value, stock),
                            transaction_id
                        ],
                    )?;
                }
                if stock != snapshot_stock {
                    return Err(migration_12_error(format!(
                        "STOCK_REPLAY_MISMATCH: {product_code} snapshot={snapshot_stock}, replay={stock}"
                    )));
                }
                Some(value)
            } else {
                // Without a baseline, accept only a ledger whose exact deltas replay from zero
                // and whose stored after-snapshots agree at every step.
                let mut tx_statement = conn.prepare(
                    "SELECT quantity_in,quantity_out,value_in,value_out,stock_after,inventory_value_after
                       FROM inventory_transactions WHERE product_id=?1
                        AND transaction_type NOT IN ('opening_balance','legacy_opening')
                      ORDER BY transaction_date ASC,id ASC",
                )?;
                let transactions = tx_statement
                    .query_map([product_id], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, i64>(2)?,
                            row.get::<_, i64>(3)?,
                            row.get::<_, i64>(4)?,
                            row.get::<_, Option<i64>>(5)?,
                        ))
                    })?
                    .collect::<Result<Vec<_>>>()?;
                let mut stock = 0_i64;
                let mut value = 0_i64;
                let mut sufficient = !transactions.is_empty();
                for (quantity_in, quantity_out, value_in, value_out, stock_after, value_after) in
                    transactions
                {
                    if (quantity_in != 0 && value_in == 0) || (quantity_out != 0 && value_out == 0)
                    {
                        sufficient = false;
                        break;
                    }
                    stock += quantity_in - quantity_out;
                    value += value_in - value_out;
                    if stock_after != stock || value_after != Some(value) {
                        sufficient = false;
                        break;
                    }
                }
                if sufficient && stock == snapshot_stock && value != 0 {
                    Some(value)
                } else {
                    None
                }
            };

            if let Some(value) = repaired {
                conn.execute(
                    "UPDATE products SET current_inventory_value=?1,average_cost=?2 WHERE id=?3",
                    rusqlite::params![
                        value,
                        rounded_absolute_cost(value, snapshot_stock),
                        product_id
                    ],
                )?;
            }
        }

        // Verification: every repaired/known snapshot must obey the value/cost invariant.
        let invalid: i64 = conn.query_row(
            "SELECT COUNT(*) FROM products
              WHERE (current_stock=0 AND (current_inventory_value<>0 OR average_cost<>0))
                 OR (current_stock<>0 AND current_inventory_value<>0
                     AND average_cost<>CAST(ROUND(ABS(CAST(current_inventory_value AS REAL)/current_stock)) AS INTEGER))",
            [],
            |row| row.get(0),
        )?;
        if invalid != 0 {
            return Err(migration_12_error(format!(
                "INVENTORY_VALUE_VERIFICATION_FAILED: {invalid} product(s)"
            )));
        }
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version) VALUES(12)",
            [],
        )?;
        Ok(())
    })();
    match result {
        Ok(()) => conn.execute_batch("COMMIT;"),
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK;");
            Err(error)
        }
    }
}

#[cfg(test)]
mod schema_version_tests {
    use super::{
        apply_migration_12, requires_pre_migration_backup, run_migrations, LATEST_SCHEMA_VERSION,
    };
    use rusqlite::{params, Connection};

    #[test]
    fn immediately_previous_schema_requires_backup_without_numeric_hardcode() {
        assert!(requires_pre_migration_backup(LATEST_SCHEMA_VERSION - 1));
        assert!(!requires_pre_migration_backup(LATEST_SCHEMA_VERSION));
        assert!(!requires_pre_migration_backup(0));
    }

    fn migration_12_fixture(stock: i64, closing_value: i64) -> (Connection, i64, i64) {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute("DELETE FROM schema_migrations WHERE version=12", [])
            .unwrap();
        conn.execute(
            "INSERT INTO products(product_code,product_name,animal_category,inventory_unit,current_stock,current_inventory_value,average_cost)
             VALUES('REPAIR-1','Repair product','heo','Bao',?1,0,0)",
            [stock],
        )
        .unwrap();
        let product_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO import_jobs(import_type,source_filename,source_file_hash,sheet_name,mode,status,started_at,
                                     dataset_hash,revision,period_start,period_end,cutover_date,establishes_inventory_baseline)
             VALUES('legacy_inventory_summary','fixture.xls','fixture-hash','Q2','controlled_migration','completed','2026-06-30',
                    'fixture-dataset',1,'2026-04-01','2026-06-30','2026-06-30',1)",
            [],
        )
        .unwrap();
        let job_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO legacy_inventory_summaries(import_job_id,product_id,period_label,period_start,period_end,
                    closing_quantity,closing_unit_cost,closing_value,source_row_number)
             VALUES(?1,?2,'Q2/2026','2026-04-01','2026-06-30',?3,1,?4,1)",
            params![job_id, product_id, stock, closing_value],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO inventory_transactions(transaction_date,product_id,transaction_type,source_type,source_id,
                    quantity_in,quantity_out,value_in,value_out,unit_cost,stock_after,inventory_value_after,new_average_cost)
             VALUES('2026-06-30',?1,'opening_balance','legacy_import',?2,0,0,0,0,0,?3,0,0)",
            params![product_id, job_id, stock],
        )
        .unwrap();
        (conn, product_id, job_id)
    }

    #[test]
    fn migration_12_repairs_from_exact_legacy_closing_value_and_opening_row() {
        let (conn, product_id, job_id) = migration_12_fixture(3, 100);
        apply_migration_12(&conn).unwrap();
        let snapshot: (i64, i64) = conn
            .query_row(
                "SELECT current_inventory_value,average_cost FROM products WHERE id=?1",
                [product_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(snapshot, (100, 33));
        let opening_value: i64 = conn
            .query_row(
                "SELECT inventory_value_after FROM inventory_transactions WHERE source_type='legacy_import' AND source_id=?1",
                [job_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(opening_value, 100);
    }

    #[test]
    fn migration_12_replays_exact_post_baseline_deltas() {
        let (conn, product_id, _) = migration_12_fixture(12, 1_000);
        conn.execute(
            "UPDATE products SET current_stock=15 WHERE id=?1",
            [product_id],
        )
        .unwrap();
        for (date, kind, quantity_in, quantity_out, value_in, value_out) in [
            ("2026-07-01", "nhap", 5, 0, 555, 0),
            ("2026-07-02", "xuat", 0, 2, 0, 200),
            ("2026-07-03", "adjustment_increase", 1, 0, 90, 0),
            ("2026-07-04", "purchase_cancel", 0, 2, 0, 222),
            ("2026-07-05", "sale_cancel", 1, 0, 100, 0),
        ] {
            conn.execute(
                "INSERT INTO inventory_transactions(transaction_date,product_id,transaction_type,source_type,source_id,
                        quantity_in,quantity_out,value_in,value_out,unit_cost,stock_after,new_average_cost)
                 VALUES(?1,?2,?3,'test',1,?4,?5,?6,?7,0,0,0)",
                params![date, product_id, kind, quantity_in, quantity_out, value_in, value_out],
            )
            .unwrap();
        }
        apply_migration_12(&conn).unwrap();
        let snapshot: (i64, i64) = conn
            .query_row(
                "SELECT current_stock,current_inventory_value FROM products WHERE id=?1",
                [product_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(snapshot, (15, 1_323));
    }

    #[test]
    fn migration_12_stock_mismatch_rolls_back_every_change() {
        let (conn, product_id, job_id) = migration_12_fixture(10, 1_000);
        conn.execute(
            "UPDATE products SET current_stock=11 WHERE id=?1",
            [product_id],
        )
        .unwrap();
        let error = apply_migration_12(&conn).unwrap_err().to_string();
        assert!(error.contains("STOCK_REPLAY_MISMATCH"));
        let values: (i64, i64, i64) = conn
            .query_row(
                "SELECT p.current_inventory_value,p.average_cost,t.inventory_value_after
                   FROM products p JOIN inventory_transactions t ON t.product_id=p.id
                  WHERE p.id=?1 AND t.source_id=?2",
                params![product_id, job_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(values, (0, 0, 0));
    }

    #[test]
    fn migration_12_does_not_fabricate_missing_value_and_normalizes_zero_stock() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute("DELETE FROM schema_migrations WHERE version=12", [])
            .unwrap();
        conn.execute_batch(
            "INSERT INTO products(product_code,product_name,animal_category,inventory_unit,current_stock,current_inventory_value,average_cost)
             VALUES('UNKNOWN','Unknown','heo','Bao',9,0,0);
             INSERT INTO products(product_code,product_name,animal_category,inventory_unit,current_stock,current_inventory_value,average_cost)
             VALUES('ZERO','Zero','heo','Bao',0,999,111);",
        )
        .unwrap();
        apply_migration_12(&conn).unwrap();
        let unknown: (i64, i64) = conn
            .query_row(
                "SELECT current_inventory_value,average_cost FROM products WHERE product_code='UNKNOWN'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        let zero: (i64, i64) = conn
            .query_row(
                "SELECT current_inventory_value,average_cost FROM products WHERE product_code='ZERO'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(unknown, (0, 0));
        assert_eq!(zero, (0, 0));
    }
}
