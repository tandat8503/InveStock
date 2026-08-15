use feed_inventory_manager_lib::domain::models::{DashboardQueryParams, ReportParamsInput};
use feed_inventory_manager_lib::infrastructure::database::connection::{init_db_pool, DbPool};
use feed_inventory_manager_lib::services::backup_service::BackupService;
use feed_inventory_manager_lib::services::inventory_service::InventoryService;
use feed_inventory_manager_lib::services::legacy_migration_service::{
    LegacyMigrationService, LegacySeedFile,
};
use tempfile::TempDir;

struct Fixture {
    directory: TempDir,
    database: std::path::PathBuf,
    pool: DbPool,
}

impl Fixture {
    fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let database = directory.path().join("feed-inventory.db");
        let pool = init_db_pool(database.clone()).unwrap();
        Self {
            directory,
            database,
            pool,
        }
    }

    fn migrate(
        &self,
        file: &LegacySeedFile,
    ) -> feed_inventory_manager_lib::services::legacy_migration_service::LegacyMigrationOutcome
    {
        self.migrate_with_hash(file, "test-dataset-sha256")
    }

    fn migrate_with_hash(
        &self,
        file: &LegacySeedFile,
        dataset_hash: &str,
    ) -> feed_inventory_manager_lib::services::legacy_migration_service::LegacyMigrationOutcome
    {
        LegacyMigrationService::new(self.pool.clone())
            .migrate(file, dataset_hash)
            .unwrap()
    }
}

fn source() -> LegacySeedFile {
    serde_json::from_str(include_str!("fixtures/legacy-inventory-fixture.json")).unwrap()
}

fn scalar(pool: &DbPool, sql: &str) -> i64 {
    pool.get()
        .unwrap()
        .query_row(sql, [], |row| row.get(0))
        .unwrap()
}

#[test]
fn imports_3_products() {
    let f = Fixture::new();
    assert_eq!(f.migrate(&source()).products_migrated, 3);
}

#[test]
fn opening_total_quantity_is_preserved() {
    let f = Fixture::new();
    assert_eq!(f.migrate(&source()).opening_quantity, 85);
}

#[test]
fn purchase_total_quantity_is_preserved() {
    let f = Fixture::new();
    assert_eq!(f.migrate(&source()).purchase_quantity, 50);
}

#[test]
fn sale_total_quantity_is_preserved() {
    let f = Fixture::new();
    assert_eq!(f.migrate(&source()).sale_quantity, 80);
}

#[test]
fn closing_total_quantity_is_preserved() {
    let f = Fixture::new();
    assert_eq!(f.migrate(&source()).closing_quantity, 55);
}

#[test]
fn every_source_row_balances() {
    assert!(source()
        .products
        .iter()
        .all(|p| p.opening_qty + p.import_qty - p.export_qty == p.closing_qty));
}

#[test]
fn current_stock_sum_reconciles() {
    let f = Fixture::new();
    f.migrate(&source());
    assert_eq!(
        scalar(&f.pool, "SELECT SUM(current_stock) FROM products"),
        55
    );
}

#[test]
fn current_inventory_value_uses_exact_source_total() {
    let f = Fixture::new();
    f.migrate(&source());
    assert_eq!(
        scalar(&f.pool, "SELECT SUM(current_inventory_value) FROM products"),
        -2111077
    );
}

#[test]
fn creates_one_summary_per_product() {
    let f = Fixture::new();
    f.migrate(&source());
    assert_eq!(
        scalar(&f.pool, "SELECT COUNT(*) FROM legacy_inventory_summaries"),
        3
    );
}

#[test]
fn missing_closing_unit_cost_is_derived_from_value_and_quantity() {
    let f = Fixture::new();
    f.migrate(&source());
    let conn = f.pool.get().unwrap();
    let value: (i64, i64) = conn.query_row(
        "SELECT closing_unit_cost,derived_closing_unit_cost FROM legacy_inventory_summaries WHERE derived_closing_unit_cost=1",
        [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
    assert_eq!(value, (217_308, 1));
}

#[test]
fn preserves_negative_closing_stock() {
    let f = Fixture::new();
    f.migrate(&source());
    assert_eq!(
        scalar(
            &f.pool,
            "SELECT COUNT(*) FROM products WHERE current_stock < 0"
        ),
        2
    );
}

#[test]
fn rerun_is_idempotent() {
    let f = Fixture::new();
    f.migrate(&source());
    assert!(f.migrate(&source()).already_applied);
    assert_eq!(
        scalar(&f.pool, "SELECT COUNT(*) FROM legacy_inventory_summaries"),
        3
    );
    assert_eq!(
        scalar(
            &f.pool,
            "SELECT COUNT(*) FROM inventory_transactions WHERE transaction_type='opening_balance'"
        ),
        3
    );
}

#[test]
fn changed_source_for_same_period_supersedes_previous_revision() {
    let f = Fixture::new();
    f.migrate(&source());
    let unrelated_product: i64 = f
        .pool
        .get()
        .unwrap()
        .query_row("SELECT id FROM products LIMIT 1", [], |row| row.get(0))
        .unwrap();
    f.pool.get().unwrap().execute("INSERT INTO inventory_transactions(transaction_date,product_id,transaction_type,source_type,source_id,quantity_in,quantity_out,value_in,value_out,unit_cost,stock_after,inventory_value_after,new_average_cost) VALUES('2026-06-30',?1,'opening_balance','manual_adjustment',987,0,0,0,0,0,0,0,0)",[unrelated_product]).unwrap();
    let mut corrected = source();
    corrected.revision += 1;
    corrected.products[0].import_qty += 1;
    corrected.products[0].import_total += 100;
    corrected.products[0].closing_qty += 1;
    corrected.products[0].closing_total += 100;
    corrected.totals.purchase_quantity += 1;
    corrected.totals.purchase_value += 100;
    corrected.totals.closing_quantity += 1;
    corrected.totals.closing_value += 100;
    let outcome = f.migrate_with_hash(&corrected, "corrected-dataset-sha256");
    assert!(!outcome.already_applied);
    assert_eq!(
        scalar(
            &f.pool,
            "SELECT COUNT(*) FROM import_jobs WHERE superseded_by IS NULL"
        ),
        1
    );
    assert_eq!(
        scalar(
            &f.pool,
            "SELECT COUNT(*) FROM import_jobs WHERE superseded_by IS NOT NULL"
        ),
        1
    );
    assert_eq!(
        scalar(&f.pool, "SELECT COUNT(*) FROM legacy_inventory_summaries"),
        6
    );
    assert_eq!(
        scalar(&f.pool, "SELECT SUM(current_inventory_value) FROM products"),
        corrected.totals.closing_value
    );
    assert_eq!(scalar(&f.pool, "SELECT COUNT(*) FROM inventory_transactions WHERE source_type='manual_adjustment' AND source_id=987"), 1);
    let active = report(&f, "2026-04-01", "2026-06-30");
    assert_eq!(
        active.rows.iter().map(|row| row.closing_value).sum::<i64>(),
        corrected.totals.closing_value
    );
}

#[test]
fn invalid_balance_rolls_back_everything() {
    let f = Fixture::new();
    let mut file = source();
    file.products[0].closing_qty += 1;
    assert!(LegacyMigrationService::new(f.pool.clone())
        .migrate(&file, "hash")
        .is_err());
    assert_eq!(scalar(&f.pool, "SELECT COUNT(*) FROM products"), 0);
}

#[test]
fn duplicate_product_code_rolls_back() {
    let f = Fixture::new();
    let mut file = source();
    file.products[1].product_code = file.products[0].product_code.clone();
    assert!(LegacyMigrationService::new(f.pool.clone())
        .migrate(&file, "hash")
        .is_err());
    assert_eq!(scalar(&f.pool, "SELECT COUNT(*) FROM products"), 0);
}

#[test]
fn conflicting_existing_product_rolls_back() {
    let f = Fixture::new();
    f.pool.get().unwrap().execute("INSERT INTO products(product_code,product_name,animal_category,package_weight_grams,inventory_unit) VALUES('TEST001','Sai tên','heo',1,'Bao')", []).unwrap();
    assert!(LegacyMigrationService::new(f.pool.clone())
        .migrate(&source(), "hash")
        .is_err());
    assert_eq!(
        scalar(&f.pool, "SELECT COUNT(*) FROM legacy_inventory_summaries"),
        0
    );
}

fn report(
    f: &Fixture,
    from: &str,
    to: &str,
) -> feed_inventory_manager_lib::domain::models::PeriodResponse<
    feed_inventory_manager_lib::domain::models::ImportExportReportRowDTO,
> {
    InventoryService::new(f.pool.clone())
        .get_import_export_report(ReportParamsInput {
            date_from: Some(from.into()),
            date_to: Some(to.into()),
            invoice_type: None,
            status: None,
            search: None,
            sort_by: None,
            page: None,
            page_size: None,
        })
        .unwrap()
}

#[test]
fn q2_report_uses_legacy_summary() {
    let f = Fixture::new();
    f.migrate(&source());
    let result = report(&f, "2026-04-01", "2026-06-30");
    assert_eq!(result.rows.iter().map(|r| r.opening_stock).sum::<i64>(), 85);
    assert_eq!(
        result
            .rows
            .iter()
            .map(|r| r.total_purchase_qty)
            .sum::<i64>(),
        50
    );
    assert_eq!(
        result.rows.iter().map(|r| r.total_sale_qty).sum::<i64>(),
        80
    );
    assert_eq!(result.rows.iter().map(|r| r.closing_stock).sum::<i64>(), 55);
}

#[test]
fn q2_report_money_totals_match_source_rows() {
    let f = Fixture::new();
    f.migrate(&source());
    let rows = report(&f, "2026-04-01", "2026-06-30").rows;
    assert_eq!(rows.iter().map(|r| r.opening_value).sum::<i64>(), -2083077);
    assert_eq!(rows.iter().map(|r| r.purchase_value).sum::<i64>(), 60000);
    assert_eq!(rows.iter().map(|r| r.sale_cost_value).sum::<i64>(), 88000);
    assert_eq!(rows.iter().map(|r| r.closing_value).sum::<i64>(), -2111077);
}

#[test]
fn legacy_opening_is_not_operational_purchase_or_sale() {
    let f = Fixture::new();
    f.migrate(&source());
    let rows = report(&f, "2026-07-01", "2026-09-30").rows;
    assert_eq!(rows.iter().map(|r| r.total_purchase_qty).sum::<i64>(), 0);
    assert_eq!(rows.iter().map(|r| r.total_sale_qty).sum::<i64>(), 0);
    assert_eq!(rows.iter().map(|r| r.opening_stock).sum::<i64>(), 55);
    assert_eq!(rows.iter().map(|r| r.closing_stock).sum::<i64>(), 55);
}

fn add_operational_transaction(f: &Fixture, date: &str, quantity_in: i64, quantity_out: i64) {
    let conn = f.pool.get().unwrap();
    let (id, stock, cost): (i64, i64, i64) = conn
        .query_row(
            "SELECT id,current_stock,average_cost FROM products WHERE product_code='TEST001'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    conn.execute("INSERT INTO inventory_transactions(transaction_date,product_id,transaction_type,source_type,source_id,quantity_in,quantity_out,unit_cost,stock_before,stock_after,old_average_cost,new_average_cost) VALUES(?1,?2,?3,'test',999,?4,?5,?6,?7,?8,?6,?6)", rusqlite::params![date,id,if quantity_in>0{"nhap"}else{"xuat"},quantity_in,quantity_out,cost,stock,stock+quantity_in-quantity_out]).unwrap();
    conn.execute(
        "UPDATE products SET current_stock=current_stock+?1-?2 WHERE id=?3",
        rusqlite::params![quantity_in, quantity_out, id],
    )
    .unwrap();
}

fn add_operational_value_transaction(
    f: &Fixture,
    date: &str,
    quantity_in: i64,
    quantity_out: i64,
    value_in: i64,
    value_out: i64,
) {
    let conn = f.pool.get().unwrap();
    let (id, stock, inventory_value): (i64, i64, i64) = conn.query_row(
        "SELECT id,current_stock,current_inventory_value FROM products WHERE product_code='TEST001'",
        [], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?))).unwrap();
    conn.execute("INSERT INTO inventory_transactions(transaction_date,product_id,transaction_type,source_type,source_id,quantity_in,quantity_out,value_in,value_out,unit_cost,stock_before,stock_after,inventory_value_before,inventory_value_after,old_average_cost,new_average_cost) VALUES(?1,?2,?3,'test',1001,?4,?5,?6,?7,0,?8,?9,?10,?11,0,0)", rusqlite::params![date,id,if quantity_in>0{"nhap"}else{"xuat"},quantity_in,quantity_out,value_in,value_out,stock,stock+quantity_in-quantity_out,inventory_value,inventory_value+value_in-value_out]).unwrap();
    conn.execute("UPDATE products SET current_stock=current_stock+?1-?2,current_inventory_value=current_inventory_value+?3-?4 WHERE id=?5",rusqlite::params![quantity_in,quantity_out,value_in,value_out,id]).unwrap();
}

#[test]
fn q3_purchase_changes_period_not_opening() {
    let f = Fixture::new();
    f.migrate(&source());
    add_operational_transaction(&f, "2026-07-10", 10, 0);
    let rows = report(&f, "2026-07-01", "2026-09-30").rows;
    assert_eq!(rows.iter().map(|r| r.opening_stock).sum::<i64>(), 55);
    assert_eq!(rows.iter().map(|r| r.total_purchase_qty).sum::<i64>(), 10);
    assert_eq!(rows.iter().map(|r| r.closing_stock).sum::<i64>(), 65);
}

#[test]
fn q3_sale_changes_period_and_closing() {
    let f = Fixture::new();
    f.migrate(&source());
    add_operational_transaction(&f, "2026-08-10", 0, 4);
    let rows = report(&f, "2026-07-01", "2026-09-30").rows;
    assert_eq!(rows.iter().map(|r| r.total_sale_qty).sum::<i64>(), 4);
    assert_eq!(rows.iter().map(|r| r.closing_stock).sum::<i64>(), 51);
}

#[test]
fn same_quarter_in_2027_uses_only_operational_transactions() {
    let f = Fixture::new();
    f.migrate(&source());
    add_operational_transaction(&f, "2027-04-10", 12, 0);
    let result = report(&f, "2027-04-01", "2027-06-30");
    assert_eq!(result.data_source, "operational");
    assert_eq!(
        result
            .rows
            .iter()
            .map(|row| row.total_purchase_qty)
            .sum::<i64>(),
        12
    );
    assert_eq!(
        result
            .rows
            .iter()
            .map(|row| row.total_sale_qty)
            .sum::<i64>(),
        0
    );
    assert_eq!(
        result.rows.iter().map(|row| row.opening_stock).sum::<i64>(),
        55
    );
    assert_eq!(
        result.rows.iter().map(|row| row.closing_stock).sum::<i64>(),
        67
    );
}

#[test]
fn historical_q3_does_not_use_current_product_snapshot() {
    let f = Fixture::new();
    f.migrate(&source());
    f.pool
        .get()
        .unwrap()
        .execute(
            "UPDATE products SET current_stock=999999 WHERE product_code='TEST001'",
            [],
        )
        .unwrap();
    assert_eq!(
        report(&f, "2026-07-01", "2026-07-31")
            .rows
            .iter()
            .map(|r| r.closing_stock)
            .sum::<i64>(),
        55
    );
}

#[test]
fn mixed_q2_q3_combines_legacy_and_operational() {
    let f = Fixture::new();
    f.migrate(&source());
    add_operational_transaction(&f, "2026-07-10", 10, 0);
    let result = report(&f, "2026-04-01", "2026-09-30");
    assert_eq!(result.data_source, "mixed");
    assert_eq!(
        result
            .rows
            .iter()
            .map(|r| r.total_purchase_qty)
            .sum::<i64>(),
        60
    );
    assert_eq!(
        result.rows.iter().map(|r| r.total_sale_qty).sum::<i64>(),
        80
    );
    assert_eq!(result.rows.iter().map(|r| r.closing_stock).sum::<i64>(), 65);
}

#[test]
fn mixed_period_money_starts_from_legacy_closing_and_reconciles_exactly() {
    let f = Fixture::new();
    f.migrate(&source());
    add_operational_value_transaction(&f, "2026-07-10", 3, 0, 299, 0);
    add_operational_value_transaction(&f, "2026-08-10", 0, 1, 0, 101);
    let result = report(&f, "2026-04-01", "2026-09-30");
    assert_eq!(result.data_source, "mixed");
    assert_eq!(
        result
            .rows
            .iter()
            .map(|row| row.total_purchase_qty)
            .sum::<i64>(),
        53
    );
    assert_eq!(
        result
            .rows
            .iter()
            .map(|row| row.total_sale_qty)
            .sum::<i64>(),
        81
    );
    assert_eq!(
        result.rows.iter().map(|row| row.closing_stock).sum::<i64>(),
        57
    );
    assert_eq!(
        result
            .rows
            .iter()
            .map(|row| row.purchase_value)
            .sum::<i64>(),
        60299
    );
    assert_eq!(
        result
            .rows
            .iter()
            .map(|row| row.sale_cost_value)
            .sum::<i64>(),
        88101
    );
    assert_eq!(
        result.rows.iter().map(|row| row.closing_value).sum::<i64>(),
        -2110879
    );
}

#[test]
fn q1_reports_incomplete_coverage_without_fake_rows() {
    let f = Fixture::new();
    f.migrate(&source());
    let result = report(&f, "2026-01-01", "2026-03-31");
    assert_eq!(result.data_coverage, "incomplete");
    assert!(result.rows.is_empty());
}

#[test]
fn partial_q2_reports_quarter_summary_only() {
    let f = Fixture::new();
    f.migrate(&source());
    let result = report(&f, "2026-05-01", "2026-05-31");
    assert_eq!(result.data_coverage, "summary_only");
    assert!(result.rows.is_empty());
}

#[test]
fn inventory_summary_q2_matches_report() {
    let f = Fixture::new();
    f.migrate(&source());
    let inventory = InventoryService::new(f.pool.clone())
        .get_inventory_summary(Some("2026-04-01".into()), Some("2026-06-30".into()))
        .unwrap();
    let report = report(&f, "2026-04-01", "2026-06-30");
    assert_eq!(
        inventory.rows.iter().map(|r| r.opening_stock).sum::<i64>(),
        report.rows.iter().map(|r| r.opening_stock).sum::<i64>()
    );
    assert_eq!(
        inventory.rows.iter().map(|r| r.closing_stock).sum::<i64>(),
        55
    );
}

#[test]
fn inventory_summary_q3_matches_report() {
    let f = Fixture::new();
    f.migrate(&source());
    add_operational_transaction(&f, "2026-07-10", 10, 0);
    let inventory = InventoryService::new(f.pool.clone())
        .get_inventory_summary(Some("2026-07-01".into()), Some("2026-09-30".into()))
        .unwrap();
    assert_eq!(
        inventory.rows.iter().map(|r| r.closing_stock).sum::<i64>(),
        report(&f, "2026-07-01", "2026-09-30")
            .rows
            .iter()
            .map(|r| r.closing_stock)
            .sum::<i64>()
    );
}

#[test]
fn dashboard_returns_submitted_custom_dates() {
    let f = Fixture::new();
    f.migrate(&source());
    let result = InventoryService::new(f.pool)
        .get_dashboard_analytics(DashboardQueryParams {
            preset: Some("custom".into()),
            date_from: Some("2026-07-01".into()),
            date_to: Some("2026-07-31".into()),
            group_by: Some("day".into()),
            compare_previous: Some(false),
        })
        .unwrap();
    assert_eq!(result.resolved_date_from, "2026-07-01");
    assert_eq!(result.resolved_date_to, "2026-07-31");
}

#[test]
fn dashboard_operational_metrics_honor_date_range() {
    let f = Fixture::new();
    f.migrate(&source());
    let conn = f.pool.get().unwrap();
    conn.execute("INSERT INTO sales_invoices(issue_code,invoice_date,buyer_type,grand_total,total_cost,estimated_profit,status) VALUES('PX-T1','2026-07-10','khach_le',1000,700,300,'xac_nhan'),('PX-T2','2026-08-10','khach_le',5000,3000,2000,'xac_nhan')",[]).unwrap();
    drop(conn);
    let result = InventoryService::new(f.pool)
        .get_dashboard_analytics(DashboardQueryParams {
            preset: Some("custom".into()),
            date_from: Some("2026-07-01".into()),
            date_to: Some("2026-07-31".into()),
            group_by: Some("day".into()),
            compare_previous: Some(false),
        })
        .unwrap();
    assert_eq!(result.net_revenue.current, 1000);
    assert_eq!(result.gross_profit.current, 300);
}

#[test]
fn dashboard_revenue_coverage_distinguishes_legacy_mixed_and_operational() {
    let f = Fixture::new();
    f.migrate(&source());
    let service = InventoryService::new(f.pool.clone());
    let dashboard = |from: &str, to: &str| {
        service
            .get_dashboard_analytics(DashboardQueryParams {
                preset: Some("custom".into()),
                date_from: Some(from.into()),
                date_to: Some(to.into()),
                group_by: Some("month".into()),
                compare_previous: Some(false),
            })
            .unwrap()
    };
    assert_eq!(
        dashboard("2026-04-01", "2026-06-30").revenue_coverage,
        "unavailable"
    );
    assert_eq!(
        dashboard("2026-04-01", "2026-09-30").revenue_coverage,
        "partial"
    );
    assert_eq!(
        dashboard("2026-07-01", "2026-09-30").revenue_coverage,
        "complete"
    );
}

#[test]
fn q2_revenue_is_not_generated() {
    let f = Fixture::new();
    f.migrate(&source());
    assert_eq!(scalar(&f.pool, "SELECT COUNT(*) FROM sales_invoices"), 0);
}

#[test]
fn sale_unit_cost_is_history_not_selling_price() {
    let f = Fixture::new();
    f.migrate(&source());
    assert!(scalar(&f.pool, "SELECT SUM(current_sale_price) FROM products") == 0);
    assert!(
        scalar(
            &f.pool,
            "SELECT SUM(sale_value) FROM legacy_inventory_summaries"
        ) > 0
    );
}

#[test]
fn no_default_25kg_weight_is_introduced() {
    let f = Fixture::new();
    let outcome = f.migrate(&source());
    assert_eq!(outcome.products_without_weight, 3);
    assert_eq!(
        scalar(
            &f.pool,
            "SELECT COUNT(*) FROM products WHERE package_weight_grams=25000"
        ),
        0
    );
}

#[test]
fn current_stock_matches_each_legacy_closing_balance() {
    let f = Fixture::new();
    f.migrate(&source());
    assert_eq!(scalar(&f.pool, "SELECT COUNT(*) FROM products p JOIN legacy_inventory_summaries l ON l.product_id=p.id WHERE p.current_stock<>l.closing_quantity"), 0);
}

#[test]
fn verified_backup_can_be_created_before_migration() {
    let f = Fixture::new();
    let backup = f.directory.path().join("pre-migration.zip");
    BackupService::new(f.pool.clone(), f.database.clone())
        .create_backup_typed(&backup, "pre_migration")
        .unwrap();
    BackupService::validate_backup(&backup).unwrap();
    f.migrate(&source());
    assert!(backup.is_file());
}

#[test]
fn stores_canonical_batch_id_once() {
    let f = Fixture::new();
    f.migrate(&source());
    let count: i64 = f.pool.get().unwrap().query_row("SELECT COUNT(DISTINCT import_batch_id) FROM legacy_inventory_summaries WHERE import_batch_id=?1", [source().batch_key], |r| r.get(0)).unwrap();
    assert_eq!(count, 1);
}

#[test]
fn historical_report_ignores_active_status() {
    let f = Fixture::new();
    f.migrate(&source());

    // 1. Create a product with operational activity in Q2/2027
    add_operational_transaction(&f, "2027-05-15", 100, 0);

    // 2. Query Q2/2027 report and save the totals
    let report_before = report(&f, "2027-04-01", "2027-06-30");
    let opening_sum_before: i64 = report_before.rows.iter().map(|r| r.opening_stock).sum();
    let purchase_sum_before: i64 = report_before
        .rows
        .iter()
        .map(|r| r.total_purchase_qty)
        .sum();
    let sale_sum_before: i64 = report_before.rows.iter().map(|r| r.total_sale_qty).sum();
    let closing_sum_before: i64 = report_before.rows.iter().map(|r| r.closing_stock).sum();

    // 3. Deactivate the product in 2028 (raw SQL to bypass stock validations for setup convenience)
    let conn = f.pool.get().unwrap();
    conn.execute(
        "UPDATE products SET active = 0 WHERE product_code = 'TEST001'",
        [],
    )
    .unwrap();

    // 4. Query Q2/2027 report again
    let report_after = report(&f, "2027-04-01", "2027-06-30");
    let opening_sum_after: i64 = report_after.rows.iter().map(|r| r.opening_stock).sum();
    let purchase_sum_after: i64 = report_after.rows.iter().map(|r| r.total_purchase_qty).sum();
    let sale_sum_after: i64 = report_after.rows.iter().map(|r| r.total_sale_qty).sum();
    let closing_sum_after: i64 = report_after.rows.iter().map(|r| r.closing_stock).sum();

    // 5. Totals must remain identical
    assert_eq!(opening_sum_before, opening_sum_after);
    assert_eq!(purchase_sum_before, purchase_sum_after);
    assert_eq!(sale_sum_before, sale_sum_after);
    assert_eq!(closing_sum_before, closing_sum_after);
}

#[test]
fn legacy_correction_preserves_user_fields() {
    let f = Fixture::new();
    f.migrate(&source());

    // 1. Modify user-maintained fields on TEST001
    let conn = f.pool.get().unwrap();
    conn.execute(
        "UPDATE products SET
            animal_category = 'UserCategory',
            package_weight_grams = 12345,
            package_weight_unit = 'g',
            package_weight_known = 1,
            brand = 'UserBrand',
            active = 0,
            latest_purchase_price = 54321,
            latest_purchase_price_known = 1,
            low_stock_threshold_override = 7,
            notes = 'UserNotes'
         WHERE product_code = 'TEST001'",
        [],
    )
    .unwrap();

    // 2. Run corrected legacy revision (increment revision and change some value to force update)
    let mut corrected = source();
    corrected.revision += 1;
    corrected.products[0].import_qty += 1;
    corrected.products[0].import_total += 100;
    corrected.products[0].closing_qty += 1;
    corrected.products[0].closing_total += 100;
    corrected.totals.purchase_quantity += 1;
    corrected.totals.purchase_value += 100;
    corrected.totals.closing_quantity += 1;
    corrected.totals.closing_value += 100;

    let outcome = f.migrate_with_hash(&corrected, "corrected-dataset-sha256");
    assert!(!outcome.already_applied);

    // 3. Verify user-maintained fields remain unchanged
    type ProductUserFields = (
        String,
        i64,
        i64,
        Option<String>,
        i64,
        i64,
        i64,
        Option<i64>,
        Option<String>,
    );
    let (category, weight, weight_known, brand, active, price, price_known, threshold, notes): ProductUserFields = conn.query_row(
        "SELECT animal_category, package_weight_grams, package_weight_known, brand, active, latest_purchase_price, latest_purchase_price_known, low_stock_threshold_override, notes FROM products WHERE product_code = 'TEST001'",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?)),
    ).unwrap();

    assert_eq!(category, "UserCategory");
    assert_eq!(weight, 12345);
    assert_eq!(weight_known, 1);
    assert_eq!(brand.as_deref(), Some("UserBrand"));
    assert_eq!(active, 0);
    assert_eq!(price, 54321);
    assert_eq!(price_known, 1);
    assert_eq!(threshold, Some(7));
    assert_eq!(notes.as_deref(), Some("UserNotes"));
}

#[test]
fn lock_legacy_correction_after_go_live() {
    let f = Fixture::new();
    f.migrate(&source());

    // 1. Add operational transaction after baseline cutover (2026-06-30 is baseline cutover)
    add_operational_transaction(&f, "2026-07-01", 10, 0);

    // 2. Try to run corrected legacy revision - must be rejected
    let mut corrected = source();
    corrected.revision += 1;
    corrected.products[0].import_qty += 1;
    corrected.products[0].import_total += 100;
    corrected.products[0].closing_qty += 1;
    corrected.products[0].closing_total += 100;
    corrected.totals.purchase_quantity += 1;
    corrected.totals.purchase_value += 100;
    corrected.totals.closing_quantity += 1;
    corrected.totals.closing_value += 100;

    let res =
        LegacyMigrationService::new(f.pool.clone()).migrate(&corrected, "corrected-dataset-sha256");
    assert!(res.is_err());
    let err_str = res.unwrap_err().to_string();
    assert_eq!(
        err_str,
        "Conflict error: Không thể thay thế dữ liệu lịch sử vì hệ thống đã có giao dịch phát sinh sau thời điểm chuyển đổi. Hãy sử dụng quy trình điều chỉnh tồn kho."
    );

    // 3. Exact same dataset must remain idempotent (already_applied = true)
    let outcome = f.migrate(&source());
    assert!(outcome.already_applied);
}

#[test]
fn multiple_legacy_periods_overlap_guard() {
    let f = Fixture::new();
    f.migrate(&source()); // Q2/2026: 2026-04-01 to 2026-06-30

    // 1. Migrate a second legacy period (Q3/2026: 2026-07-01 to 2026-09-30)
    let mut q3_source = source();
    q3_source.period_label = "Q3/2026".to_string();
    q3_source.period_start = "2026-07-01".to_string();
    q3_source.period_end_date = "2026-09-30".to_string();
    q3_source.cutover_date = "2026-09-30".to_string();
    q3_source.batch_key = "LEGACY-Q3-2026-001".to_string();
    f.migrate_with_hash(&q3_source, "q3-dataset-sha256");

    // 2. Query a range that overlaps both: 2026-05-01 to 2026-08-01
    let rep = report(&f, "2026-05-01", "2026-08-01");

    // 3. Assert it returns data_coverage = incomplete
    assert_eq!(rep.data_coverage, "incomplete");
    assert_eq!(
        rep.message.as_deref(),
        Some("Khoảng ngày chọn bao phủ nhiều giai đoạn dữ liệu lịch sử tổng hợp. Hệ thống chưa hỗ trợ gộp nhiều kỳ lịch sử khác nhau.")
    );
}

#[test]
fn current_inventory_reads_products_snapshot() {
    let f = Fixture::new();
    let service = InventoryService::new(f.pool.clone());
    // Initially, there are no products
    let current = service.get_current_inventory().unwrap();
    assert_eq!(current.len(), 0);

    // Migrate Q2 source which imports 3 products
    f.migrate(&source());

    let current = service.get_current_inventory().unwrap();
    assert_eq!(current.len(), 3);

    let mut codes: Vec<String> = current.iter().map(|p| p.product_code.clone()).collect();
    codes.sort();
    assert_eq!(codes, vec!["TEST001", "TEST002", "TEST003"]);
}

#[test]
fn orphan_current_stock_is_detected_as_incomplete_history() {
    let f = Fixture::new();
    let conn = f.pool.get().unwrap();
    conn.execute(
        "INSERT INTO products (product_code, product_name, animal_category, package_weight_grams, package_weight_unit, inventory_unit, active, current_stock, current_inventory_value) \
         VALUES ('ORPHAN01', 'Orphan Feed', 'heo', 25000, 'kg', 'Bao', 1, 10, 1000)",
        []
    ).unwrap();

    let service = InventoryService::new(f.pool.clone());

    let health = service.check_inventory_data_health().unwrap();
    assert!(!health.is_healthy);
    assert!(health.has_orphans);
    assert!(health
        .orphan_details
        .unwrap()
        .contains("ORPHAN_CURRENT_STOCK"));

    let rep = service
        .get_inventory_summary(Some("2026-04-01".into()), Some("2026-06-30".into()))
        .unwrap();
    assert_eq!(rep.data_coverage, "incomplete");
    assert!(rep
        .message
        .unwrap()
        .contains("Dữ liệu tồn hiện tại tồn tại nhưng chưa có lịch sử khởi tạo"));
}

#[test]
fn fresh_empty_db_is_valid() {
    let f = Fixture::new();
    let service = InventoryService::new(f.pool.clone());

    let health = service.check_inventory_data_health().unwrap();
    assert!(health.is_healthy);
    assert!(!health.has_orphans);

    let current = service.get_current_inventory().unwrap();
    assert_eq!(current.len(), 0);

    let rep = service.get_inventory_summary(None, None).unwrap();
    assert_eq!(rep.data_coverage, "complete");
    assert_eq!(rep.rows.len(), 0);
}
