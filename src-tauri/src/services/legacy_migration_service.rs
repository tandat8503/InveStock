use crate::domain::errors::{AppError, AppResult};
use crate::infrastructure::database::connection::DbPool;
use rusqlite::{params, OptionalExtension, Transaction, TransactionBehavior};
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Debug, Clone, Deserialize)]
pub struct LegacySeedFile {
    pub source_file_name: String,
    pub source_file_hash: String,
    pub batch_key: String,
    pub revision: i64,
    pub period_label: String,
    pub period_start: String,
    pub period_end_date: String,
    pub cutover_date: String,
    pub data_granularity: String,
    pub establishes_inventory_baseline: bool,
    pub sale_value_semantics: String,
    pub has_revenue_data: bool,
    pub has_invoice_detail: bool,
    pub products: Vec<LegacyProduct>,
    pub totals: LegacyTotals,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LegacyTotals {
    pub row_count: usize,
    pub opening_quantity: i64,
    pub opening_value: i64,
    pub purchase_quantity: i64,
    pub purchase_value: i64,
    pub sale_quantity: i64,
    pub sale_value: i64,
    pub closing_quantity: i64,
    pub closing_value: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LegacyProduct {
    pub stt: i64,
    pub product_code: String,
    pub product_name: String,
    pub inventory_unit: String,
    pub animal_category_guess: String,
    pub opening_qty: i64,
    pub opening_unit_cost: Option<i64>,
    pub opening_total: i64,
    pub import_qty: i64,
    pub import_unit_cost: Option<i64>,
    pub import_total: i64,
    pub export_qty: i64,
    pub export_unit_cost: Option<i64>,
    pub export_total: i64,
    pub closing_qty: i64,
    pub closing_unit_cost: Option<i64>,
    pub closing_total: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LegacyMigrationOutcome {
    pub already_applied: bool,
    pub products_migrated: usize,
    pub summaries_created: usize,
    pub opening_quantity: i64,
    pub purchase_quantity: i64,
    pub sale_quantity: i64,
    pub closing_quantity: i64,
    pub opening_value: i64,
    pub purchase_value: i64,
    pub sale_value: i64,
    pub closing_value: i64,
    pub negative_stock_products: Vec<String>,
    pub derived_closing_costs: Vec<String>,
    pub products_without_weight: usize,
}

pub struct LegacyMigrationService {
    pool: DbPool,
}

impl LegacyMigrationService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn migrate(
        &self,
        file: &LegacySeedFile,
        dataset_hash: &str,
    ) -> AppResult<LegacyMigrationOutcome> {
        validate_file(file)?;
        if dataset_hash.trim().is_empty() {
            return Err(AppError::Validation(
                "Dataset hash không được để trống".into(),
            ));
        }
        let mut connection = self
            .pool
            .get()
            .map_err(|error| AppError::Database(error.to_string()))?;
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let same_job: Option<i64> = transaction.query_row(
            "SELECT id FROM import_jobs WHERE source_file_hash=?1 AND dataset_hash=?2 AND revision=?3 AND period_start=?4 AND period_end=?5 AND superseded_by IS NULL",
            params![file.source_file_hash,dataset_hash,file.revision,file.period_start,file.period_end_date], |row| row.get(0)).optional()?;
        if let Some(job_id) = same_job {
            let outcome = verification_outcome(&transaction, job_id, true)?;
            transaction.commit()?;
            return Ok(outcome);
        }

        validate_existing_products(&transaction, file)?;
        let previous_jobs = active_jobs_for_period(&transaction, file)?;
        if !previous_jobs.is_empty() {
            let has_ops: i64 = transaction.query_row(
                "SELECT COUNT(*) FROM inventory_transactions
                 WHERE transaction_type NOT IN ('legacy_opening', 'opening_balance')
                   AND source_type NOT IN ('legacy_opening', 'opening_balance', 'legacy_import')
                   AND transaction_date > ?1",
                params![file.cutover_date],
                |row| row.get(0),
            )?;
            if has_ops > 0 {
                return Err(AppError::Conflict(
                    "Không thể thay thế dữ liệu lịch sử vì hệ thống đã có giao dịch phát sinh sau thời điểm chuyển đổi. Hãy sử dụng quy trình điều chỉnh tồn kho.".to_string()
                ));
            }
        }
        let import_job_id = create_import_job(&transaction, file, dataset_hash)?;
        for previous_job in previous_jobs {
            transaction.execute(
                "UPDATE import_jobs SET status='superseded',superseded_by=?1 WHERE id=?2",
                params![import_job_id, previous_job],
            )?;
            transaction.execute("DELETE FROM inventory_transactions WHERE transaction_type IN ('legacy_opening','opening_balance') AND source_type='legacy_import' AND source_id=?1", [previous_job])?;
        }

        let mut negative_stock_products = Vec::new();
        let mut derived_closing_costs = Vec::new();
        for product in &file.products {
            let (closing_cost, derived) = closing_cost(product);
            let product_id = upsert_product(&transaction, product, closing_cost, file)?;
            insert_summary(
                &transaction,
                import_job_id,
                product_id,
                product,
                closing_cost,
                derived,
                file,
            )?;
            insert_opening_balance(
                &transaction,
                import_job_id,
                product_id,
                product,
                closing_cost,
                file,
            )?;
            if product.closing_qty < 0 {
                negative_stock_products.push(product.product_code.clone());
            }
            if derived {
                derived_closing_costs.push(format!("{}={closing_cost}", product.product_code));
            }
        }
        let mut outcome = verification_outcome(&transaction, import_job_id, false)?;
        outcome.negative_stock_products = negative_stock_products;
        outcome.derived_closing_costs = derived_closing_costs;
        validate_outcome(&outcome, &file.totals)?;
        transaction.commit()?;
        Ok(outcome)
    }
}

fn validate_file(file: &LegacySeedFile) -> AppResult<()> {
    if file.products.len() != file.totals.row_count {
        return Err(AppError::Validation("Số dòng không khớp metadata".into()));
    }
    if file.period_start > file.period_end_date || file.cutover_date < file.period_end_date {
        return Err(AppError::Validation(
            "Metadata kỳ dữ liệu không hợp lệ".into(),
        ));
    }
    if file.source_file_hash.trim().is_empty()
        || file.batch_key.trim().is_empty()
        || file.revision < 1
    {
        return Err(AppError::Validation(
            "Thiếu source hash, batch key hoặc revision".into(),
        ));
    }
    if file.sale_value_semantics != "cogs" && file.sale_value_semantics != "revenue" {
        return Err(AppError::Validation(
            "sale_value_semantics không hợp lệ".into(),
        ));
    }
    let actual = row_totals(file);
    let expected = (
        &file.totals.opening_quantity,
        &file.totals.opening_value,
        &file.totals.purchase_quantity,
        &file.totals.purchase_value,
        &file.totals.sale_quantity,
        &file.totals.sale_value,
        &file.totals.closing_quantity,
        &file.totals.closing_value,
    );
    if actual
        != (
            *expected.0,
            *expected.1,
            *expected.2,
            *expected.3,
            *expected.4,
            *expected.5,
            *expected.6,
            *expected.7,
        )
    {
        return Err(AppError::Validation(
            "Tổng từng dòng không khớp metadata dataset".into(),
        ));
    }
    let mut codes = HashSet::new();
    for product in &file.products {
        if !codes.insert(product.product_code.trim()) {
            return Err(AppError::Validation(format!(
                "Trùng mã sản phẩm {}",
                product.product_code
            )));
        }
        if product.product_code.trim().is_empty() || product.product_name.trim().is_empty() {
            return Err(AppError::Validation("Mã hoặc tên sản phẩm trống".into()));
        }
        if product.opening_qty + product.import_qty - product.export_qty != product.closing_qty {
            return Err(AppError::Validation(format!(
                "Sản phẩm {} không cân phương trình tồn kho",
                product.product_code
            )));
        }
    }
    Ok(())
}

fn row_totals(file: &LegacySeedFile) -> (i64, i64, i64, i64, i64, i64, i64, i64) {
    file.products.iter().fold((0, 0, 0, 0, 0, 0, 0, 0), |a, p| {
        (
            a.0 + p.opening_qty,
            a.1 + p.opening_total,
            a.2 + p.import_qty,
            a.3 + p.import_total,
            a.4 + p.export_qty,
            a.5 + p.export_total,
            a.6 + p.closing_qty,
            a.7 + p.closing_total,
        )
    })
}

fn closing_cost(product: &LegacyProduct) -> (i64, bool) {
    if let Some(cost) = product.closing_unit_cost.filter(|value| *value > 0) {
        return (cost, false);
    }
    if product.closing_qty != 0 && product.closing_total != 0 {
        return (
            ((product.closing_total as f64 / product.closing_qty as f64)
                .abs()
                .round()) as i64,
            true,
        );
    }
    (0, false)
}

fn validate_existing_products(tx: &Transaction<'_>, file: &LegacySeedFile) -> AppResult<()> {
    for product in &file.products {
        let existing: Option<(String, String)> = tx
            .query_row(
                "SELECT product_name,inventory_unit FROM products WHERE product_code=?1",
                [&product.product_code],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        if let Some((name, unit)) = existing {
            if name.trim() != product.product_name.trim()
                || unit.trim() != product.inventory_unit.trim()
            {
                return Err(AppError::Conflict(format!(
                    "Mã {} đã tồn tại nhưng tên hoặc đơn vị không khớp",
                    product.product_code
                )));
            }
        }
    }
    Ok(())
}

fn active_jobs_for_period(tx: &Transaction<'_>, file: &LegacySeedFile) -> AppResult<Vec<i64>> {
    let mut statement=tx.prepare("SELECT id FROM import_jobs WHERE period_start=?1 AND period_end=?2 AND superseded_by IS NULL")?;
    let result = statement
        .query_map(params![file.period_start, file.period_end_date], |row| {
            row.get(0)
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::from);
    result
}

fn create_import_job(
    tx: &Transaction<'_>,
    file: &LegacySeedFile,
    dataset_hash: &str,
) -> AppResult<i64> {
    tx.execute("INSERT INTO import_jobs(import_type,source_filename,source_file_hash,dataset_hash,revision,sheet_name,mode,total_rows,imported_rows,status,started_at,completed_at,options_json,batch_key,period_start,period_end,data_granularity,cutover_date,establishes_inventory_baseline,sale_value_semantics,has_revenue_data,has_invoice_detail) VALUES('legacy_inventory_summary',?1,?2,?3,?4,?5,'controlled_migration',?6,?6,'completed',datetime('now','localtime'),datetime('now','localtime'),?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",params![file.source_file_name,file.source_file_hash,dataset_hash,file.revision,file.period_label,file.totals.row_count as i64,format!("{{\"revision\":{}}}",file.revision),file.batch_key,file.period_start,file.period_end_date,file.data_granularity,file.cutover_date,if file.establishes_inventory_baseline{1}else{0},file.sale_value_semantics,if file.has_revenue_data{1}else{0},if file.has_invoice_detail{1}else{0}])?;
    Ok(tx.last_insert_rowid())
}

fn upsert_product(
    tx: &Transaction<'_>,
    product: &LegacyProduct,
    closing_cost: i64,
    file: &LegacySeedFile,
) -> AppResult<i64> {
    let existing_id: Option<i64> = tx
        .query_row(
            "SELECT id FROM products WHERE product_code=?1",
            [&product.product_code],
            |row| row.get(0),
        )
        .optional()?;
    let (current_stock, current_value) = if let Some(id) = existing_id {
        replay_post_baseline_transactions(
            tx,
            id,
            &file.cutover_date,
            product.closing_qty,
            product.closing_total,
        )?
    } else {
        (product.closing_qty, product.closing_total)
    };
    let average_cost = if current_stock != 0 {
        (current_value as f64 / current_stock as f64).abs().round() as i64
    } else {
        closing_cost
    };
    let notes = format!(
        "Dữ liệu chuyển đổi {}; trọng lượng và giá nhập gần nhất chưa xác định",
        file.period_label
    );
    if let Some(id) = existing_id {
        tx.execute(
            "UPDATE products SET
                product_name=?1, inventory_unit=?2,
                average_cost=?3, current_stock=?4, current_inventory_value=?5,
                updated_at=datetime('now','localtime')
             WHERE id=?6",
            params![
                product.product_name,
                product.inventory_unit,
                average_cost,
                current_stock,
                current_value,
                id
            ],
        )?;
        Ok(id)
    } else {
        tx.execute("INSERT INTO products(product_code,product_name,animal_category,package_weight_grams,package_weight_unit,package_weight_known,inventory_unit,latest_purchase_price,latest_purchase_price_known,average_cost,current_sale_price,current_stock,current_inventory_value,active,notes) VALUES(?1,?2,?3,0,'g',0,?4,0,0,?5,0,?6,?7,1,?8)",params![product.product_code,product.product_name,product.animal_category_guess,product.inventory_unit,average_cost,current_stock,current_value,notes])?;
        Ok(tx.last_insert_rowid())
    }
}

fn replay_post_baseline_transactions(
    tx: &Transaction<'_>,
    product_id: i64,
    cutover_date: &str,
    mut stock: i64,
    mut value: i64,
) -> AppResult<(i64, i64)> {
    let mut statement = tx.prepare(
        "SELECT id,quantity_in,quantity_out,value_in,value_out
           FROM inventory_transactions
          WHERE product_id=?1 AND transaction_date>?2
            AND transaction_type NOT IN ('legacy_opening','opening_balance')
          ORDER BY transaction_date ASC,id ASC",
    )?;
    let rows = statement
        .query_map(params![product_id, cutover_date], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(statement);

    for (id, quantity_in, quantity_out, value_in, value_out) in rows {
        let stock_before = stock;
        let value_before = value;
        stock += quantity_in - quantity_out;
        value += value_in - value_out;
        let old_cost = closing_cost_from_totals(stock_before, value_before);
        let new_cost = closing_cost_from_totals(stock, value);
        tx.execute(
            "UPDATE inventory_transactions
                SET stock_before=?1,stock_after=?2,
                    inventory_value_before=?3,inventory_value_after=?4,
                    old_average_cost=?5,new_average_cost=?6
              WHERE id=?7",
            params![
                stock_before,
                stock,
                value_before,
                value,
                old_cost,
                new_cost,
                id
            ],
        )?;
    }
    Ok((stock, value))
}

fn closing_cost_from_totals(stock: i64, value: i64) -> i64 {
    if stock == 0 {
        0
    } else {
        (value as f64 / stock as f64).abs().round() as i64
    }
}

fn insert_summary(
    tx: &Transaction<'_>,
    job_id: i64,
    product_id: i64,
    p: &LegacyProduct,
    closing_cost: i64,
    derived: bool,
    file: &LegacySeedFile,
) -> AppResult<()> {
    tx.execute("INSERT INTO legacy_inventory_summaries(import_job_id,product_id,period_label,period_start,period_end,opening_quantity,opening_unit_cost,opening_value,purchase_quantity,purchase_unit_cost,purchase_value,sale_quantity,sale_unit_cost,sale_value,closing_quantity,closing_unit_cost,closing_value,source_row_number,warnings_json,source_file_name,import_batch_id,source_type,notes,derived_closing_unit_cost) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,'[]',?19,?20,'legacy_excel',?21,?22)",params![job_id,product_id,file.period_label,file.period_start,file.period_end_date,p.opening_qty,p.opening_unit_cost.unwrap_or(0),p.opening_total,p.import_qty,p.import_unit_cost.unwrap_or(0),p.import_total,p.export_qty,p.export_unit_cost.unwrap_or(0),p.export_total,p.closing_qty,closing_cost,p.closing_total,p.stt,file.source_file_name,file.batch_key,format!("Đơn giá xuất có semantics: {}",file.sale_value_semantics),if derived{1}else{0}])?;
    Ok(())
}

fn insert_opening_balance(
    tx: &Transaction<'_>,
    job_id: i64,
    product_id: i64,
    p: &LegacyProduct,
    cost: i64,
    file: &LegacySeedFile,
) -> AppResult<()> {
    tx.execute("INSERT INTO inventory_transactions(transaction_date,product_id,transaction_type,source_type,source_id,quantity_in,quantity_out,value_in,value_out,unit_cost,stock_before,stock_after,inventory_value_before,inventory_value_after,old_average_cost,new_average_cost) VALUES(?1,?2,'opening_balance','legacy_import',?3,0,0,0,0,?4,NULL,?5,NULL,?6,NULL,?4)",params![file.cutover_date,product_id,job_id,cost,p.closing_qty,p.closing_total])?;
    Ok(())
}

fn verification_outcome(
    tx: &Transaction<'_>,
    job_id: i64,
    already_applied: bool,
) -> AppResult<LegacyMigrationOutcome> {
    let totals=tx.query_row("SELECT COUNT(*),COALESCE(SUM(opening_quantity),0),COALESCE(SUM(purchase_quantity),0),COALESCE(SUM(sale_quantity),0),COALESCE(SUM(closing_quantity),0),COALESCE(SUM(opening_value),0),COALESCE(SUM(purchase_value),0),COALESCE(SUM(sale_value),0),COALESCE(SUM(closing_value),0) FROM legacy_inventory_summaries WHERE import_job_id=?1",[job_id],|r|Ok((r.get::<_,i64>(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?,r.get(8)?)))?;

    // 1. Verify opening balance totals in inventory_transactions
    let (opening_balance_stock, opening_balance_value): (i64, i64) = tx.query_row(
        "SELECT COALESCE(SUM(stock_after), 0), COALESCE(SUM(inventory_value_after), 0)
         FROM inventory_transactions
         WHERE source_type = 'legacy_import' AND source_id = ?1 AND transaction_type = 'opening_balance'",
        [job_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    if opening_balance_stock != totals.4 || opening_balance_value != totals.8 {
        return Err(AppError::Validation(format!(
            "Đối soát opening balance thất bại: stock {opening_balance_stock}/{}, value {opening_balance_value}/{}",
            totals.4, totals.8
        )));
    }

    // 2. Verify appropriate reconstructed current state
    let cutover: String = tx.query_row(
        "SELECT cutover_date FROM import_jobs WHERE id = ?1",
        [job_id],
        |r| r.get(0),
    )?;

    let (reconstructed_stock, reconstructed_value): (i64, i64) = tx.query_row(
        "SELECT
            COALESCE(SUM(p.current_stock - COALESCE((
                SELECT SUM(t.quantity_in - t.quantity_out)
                FROM inventory_transactions t
                WHERE t.product_id = p.id
                  AND t.transaction_date > ?2
                  AND t.transaction_type NOT IN ('legacy_opening', 'opening_balance')
            ), 0)), 0),
            COALESCE(SUM(p.current_inventory_value - COALESCE((
                SELECT SUM(t.value_in - t.value_out)
                FROM inventory_transactions t
                WHERE t.product_id = p.id
                  AND t.transaction_date > ?2
                  AND t.transaction_type NOT IN ('legacy_opening', 'opening_balance')
            ), 0)), 0)
         FROM products p
         JOIN legacy_inventory_summaries l ON l.product_id = p.id
         WHERE l.import_job_id = ?1",
        params![job_id, cutover],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;

    if reconstructed_stock != totals.4 || reconstructed_value != totals.8 {
        return Err(AppError::Validation(format!(
            "Đối soát reconstructed current state thất bại: stock {reconstructed_stock}/{}, value {reconstructed_value}/{}",
            totals.4, totals.8
        )));
    }

    let without_weight:i64=tx.query_row("SELECT COUNT(*) FROM products p JOIN legacy_inventory_summaries l ON l.product_id=p.id WHERE l.import_job_id=?1 AND p.package_weight_known=0",[job_id],|r|r.get(0))?;
    Ok(LegacyMigrationOutcome {
        already_applied,
        products_migrated: totals.0 as usize,
        summaries_created: totals.0 as usize,
        opening_quantity: totals.1,
        purchase_quantity: totals.2,
        sale_quantity: totals.3,
        closing_quantity: totals.4,
        opening_value: totals.5,
        purchase_value: totals.6,
        sale_value: totals.7,
        closing_value: totals.8,
        negative_stock_products: Vec::new(),
        derived_closing_costs: Vec::new(),
        products_without_weight: without_weight as usize,
    })
}

fn validate_outcome(outcome: &LegacyMigrationOutcome, expected: &LegacyTotals) -> AppResult<()> {
    if outcome.products_migrated != expected.row_count
        || outcome.opening_quantity != expected.opening_quantity
        || outcome.purchase_quantity != expected.purchase_quantity
        || outcome.sale_quantity != expected.sale_quantity
        || outcome.closing_quantity != expected.closing_quantity
        || outcome.opening_value != expected.opening_value
        || outcome.purchase_value != expected.purchase_value
        || outcome.sale_value != expected.sale_value
        || outcome.closing_value != expected.closing_value
    {
        return Err(AppError::Validation(
            "Đối soát sau migration không khớp metadata".into(),
        ));
    }
    Ok(())
}
