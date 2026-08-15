use feed_inventory_manager_lib::infrastructure::database::connection::init_db_pool;
use feed_inventory_manager_lib::services::backup_service::BackupService;
use feed_inventory_manager_lib::services::legacy_migration_service::{
    LegacyMigrationService, LegacySeedFile,
};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const CONFIRMATION: &str = "MIGRATE-LEGACY-INVENTORY";

fn main() {
    if let Err(error) = run() {
        eprintln!("MIGRATION THẤT BẠI: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let arguments: Vec<String> = env::args().skip(1).collect();
    let database = PathBuf::from(argument_value(&arguments, "--database")?);
    let input = PathBuf::from(argument_value(&arguments, "--input")?);
    let confirmation = argument_value(&arguments, "--confirm")?;
    if confirmation != CONFIRMATION {
        return Err(format!(
            "Xác nhận không đúng. Chỉ chạy khi có --confirm {CONFIRMATION}"
        ));
    }
    if !database.is_file() || !input.is_file() {
        return Err("Không tìm thấy database hoặc JSON migration".to_string());
    }

    let bytes = fs::read(&input).map_err(|error| error.to_string())?;
    let file: LegacySeedFile = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    let source_hash = format!("{:x}", Sha256::digest(&bytes));
    let backup_pool = backup_only_pool(&database)?;
    let backup = pre_migration_backup(&backup_pool, &database)?;
    println!("Backup trước migration đã xác minh: {}", backup.display());
    drop(backup_pool);

    let pool = init_db_pool(database.clone()).map_err(|error| error.to_string())?;
    let outcome = LegacyMigrationService::new(pool.clone())
        .migrate(&file, &source_hash)
        .map_err(|error| error.to_string())?;
    if outcome.already_applied {
        println!("Dataset này đã được chuyển đổi trước đó.");
    }
    println!("Products migrated: {}", outcome.products_migrated);
    println!("Legacy summaries: {}", outcome.summaries_created);
    println!("Opening qty: {}", outcome.opening_quantity);
    println!("Purchase qty: {}", outcome.purchase_quantity);
    println!("Sale qty: {}", outcome.sale_quantity);
    println!("Closing qty: {}", outcome.closing_quantity);
    println!("Opening value: {}", outcome.opening_value);
    println!("Purchase value: {}", outcome.purchase_value);
    println!("Sale value / COGS: {}", outcome.sale_value);
    println!("Closing value: {}", outcome.closing_value);
    println!(
        "Negative-stock products: {}",
        outcome.negative_stock_products.join(", ")
    );
    println!(
        "Products without package weight: {}",
        outcome.products_without_weight
    );
    println!(
        "Derived closing costs: {}",
        outcome.derived_closing_costs.join(", ")
    );
    let has_output_backup = optional_argument_value(&arguments, "--output-backup").is_some();
    let (current_stock, current_value): (i64, i64) = pool.get().map_err(|error| error.to_string())?
        .query_row("SELECT COALESCE(SUM(current_stock),0),COALESCE(SUM(current_inventory_value),0) FROM products", [], |row| Ok((row.get(0)?,row.get(1)?)))
        .map_err(|error| error.to_string())?;

    let mut is_valid = outcome.products_migrated == file.totals.row_count
        && outcome.opening_quantity == file.totals.opening_quantity
        && outcome.purchase_quantity == file.totals.purchase_quantity
        && outcome.sale_quantity == file.totals.sale_quantity
        && outcome.closing_quantity == file.totals.closing_quantity;

    if has_output_backup
        && (current_stock != file.totals.closing_quantity
            || current_value != file.totals.closing_value)
    {
        is_valid = false;
    }

    if !is_valid {
        return Err(
            "Verification sau migration không khớp metadata; không tạo InitialData backup.".into(),
        );
    }
    if let Some(output) = optional_argument_value(&arguments, "--output-backup") {
        let destination = PathBuf::from(output);
        BackupService::new(pool, database.clone())
            .create_backup_typed(&destination, "initial_data")
            .map_err(|error| error.to_string())?;
        BackupService::validate_backup(&destination).map_err(|error| error.to_string())?;
        println!("InitialData backup đã xác minh: {}", destination.display());
    }
    Ok(())
}

fn backup_only_pool(
    database: &Path,
) -> Result<feed_inventory_manager_lib::infrastructure::database::connection::DbPool, String> {
    let manager = SqliteConnectionManager::file(database).with_init(|connection| {
        connection.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
        )
    });
    Pool::new(manager).map_err(|error| error.to_string())
}

fn argument_value(arguments: &[String], name: &str) -> Result<String, String> {
    let index = arguments
        .iter()
        .position(|argument| argument == name)
        .ok_or_else(|| format!("Thiếu tham số {name}"))?;
    arguments
        .get(index + 1)
        .cloned()
        .ok_or_else(|| format!("Thiếu giá trị cho {name}"))
}

fn optional_argument_value(arguments: &[String], name: &str) -> Option<String> {
    arguments
        .iter()
        .position(|argument| argument == name)
        .and_then(|index| arguments.get(index + 1))
        .cloned()
}

fn pre_migration_backup(
    pool: &feed_inventory_manager_lib::infrastructure::database::connection::DbPool,
    database: &Path,
) -> Result<PathBuf, String> {
    let destination = database
        .parent()
        .ok_or_else(|| "Database không có thư mục cha".to_string())?
        .join("backups")
        .join(format!(
            "InveStock_PreLegacyMigration_{}.zip",
            chrono::Local::now().format("%Y-%m-%d_%H%M%S")
        ));
    BackupService::new(pool.clone(), database.to_path_buf())
        .create_backup_typed(&destination, "pre_migration")
        .map_err(|error| error.to_string())?;
    BackupService::validate_backup(&destination).map_err(|error| error.to_string())?;
    Ok(destination)
}
