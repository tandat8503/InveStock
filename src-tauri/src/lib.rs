use std::path::PathBuf;
use tauri::Manager;

pub mod commands;
pub mod domain;
pub mod infrastructure;
pub mod services;
pub mod state;

use commands::backup_commands::*;
use commands::inventory_commands::*;
use commands::payment_commands::*;
use commands::product_commands::*;
use commands::purchase_commands::*;
use commands::sale_commands::*;
#[cfg(any(debug_assertions, feature = "dev-seed"))]
use commands::seed_commands::*;
use commands::settings_commands::*;
use commands::supplier_commands::*;
use infrastructure::database::connection::{init_db_pool, init_db_pool_without_migrations};
use infrastructure::database::migrations::requires_pre_migration_backup;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("./data"));

            let db_path = app_data_dir.join("feed-inventory.db");
            if db_path.exists() {
                let backup_pool = init_db_pool_without_migrations(db_path.clone())
                    .expect("Không thể mở database để kiểm tra trước migration");
                let schema_version: i64 = backup_pool
                    .get()
                    .expect("Không thể đọc schema database")
                    .query_row(
                        "SELECT COALESCE(MAX(version),0) FROM schema_migrations",
                        [],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);
                if requires_pre_migration_backup(schema_version) {
                    let destination = app_data_dir.join("backups").join(format!(
                        "InveStock_PreMigration_{}.zip",
                        chrono::Local::now().format("%Y-%m-%d_%H%M%S")
                    ));
                    services::backup_service::BackupService::new(
                        backup_pool.clone(),
                        db_path.clone(),
                    )
                    .create_backup_typed(&destination, "pre_migration")
                    .expect("Không thể tạo và xác minh backup trước migration");
                }
                drop(backup_pool);
            }
            let pool =
                init_db_pool(db_path.clone()).expect("Failed to initialize SQLite database pool");

            let backup_folder = app_data_dir.join("backups").to_string_lossy().to_string();
            if let Err(error) = services::backup_service::BackupService::run_daily_automatic_backup(
                pool.clone(),
                db_path.clone(),
                backup_folder,
            ) {
                log::error!("Automatic backup failed: {error}");
            }

            app.manage(AppState::new(pool, db_path));
            Ok(())
        });

    #[cfg(any(debug_assertions, feature = "dev-seed"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        get_products,
        get_product_by_id,
        create_product,
        update_product,
        toggle_product_active,
        delete_product,
        get_suppliers,
        get_supplier_by_id,
        get_supplier_stats,
        create_supplier,
        update_supplier,
        toggle_supplier_active,
        delete_supplier,
        get_purchase_invoices,
        get_purchase_invoice_by_id,
        create_purchase_invoice_draft,
        confirm_purchase_invoice,
        update_purchase_invoice_draft,
        delete_purchase_invoice_draft,
        record_supplier_payment,
        get_supplier_payments,
        get_sales_invoices,
        get_sales_invoice_by_id,
        create_sales_invoice_draft,
        confirm_sales_invoice,
        update_sales_invoice_draft,
        delete_sales_invoice_draft,
        create_backup,
        restore_backup,
        get_backup_status,
        run_backup_health_check,
        get_product_price_history,
        get_dashboard_analytics,
        get_inventory_summary,
        get_product_inventory_history,
        search_invoices,
        get_revenue_report,
        get_product_sales_report,
        get_supplier_debt_report,
        get_import_export_report,
        get_report_data_range,
        get_db_stats,
        seed_demo_data,
        get_settings,
        update_settings,
        cancel_sales_invoice,
        cancel_purchase_invoice,
        void_supplier_payment,
        create_inventory_adjustment,
        get_inventory_adjustments,
        get_current_inventory,
        check_inventory_data_health
    ]);

    #[cfg(not(any(debug_assertions, feature = "dev-seed")))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        get_products,
        get_product_by_id,
        create_product,
        update_product,
        toggle_product_active,
        delete_product,
        get_suppliers,
        get_supplier_by_id,
        get_supplier_stats,
        create_supplier,
        update_supplier,
        toggle_supplier_active,
        delete_supplier,
        get_purchase_invoices,
        get_purchase_invoice_by_id,
        create_purchase_invoice_draft,
        confirm_purchase_invoice,
        update_purchase_invoice_draft,
        delete_purchase_invoice_draft,
        record_supplier_payment,
        get_supplier_payments,
        get_sales_invoices,
        get_sales_invoice_by_id,
        create_sales_invoice_draft,
        confirm_sales_invoice,
        update_sales_invoice_draft,
        delete_sales_invoice_draft,
        create_backup,
        restore_backup,
        get_backup_status,
        run_backup_health_check,
        get_product_price_history,
        get_dashboard_analytics,
        get_inventory_summary,
        get_product_inventory_history,
        search_invoices,
        get_revenue_report,
        get_product_sales_report,
        get_supplier_debt_report,
        get_import_export_report,
        get_report_data_range,
        get_settings,
        update_settings,
        cancel_sales_invoice,
        cancel_purchase_invoice,
        void_supplier_payment,
        create_inventory_adjustment,
        get_inventory_adjustments,
        get_current_inventory,
        check_inventory_data_health
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
