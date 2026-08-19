use std::collections::HashMap;

use rusqlite::Connection;

use crate::domain::errors::{AppError, AppResult};
use crate::domain::models::{
    IntegritySeverity, InventoryDataHealth, InventoryReconciliationIssue, RestoreValidationResult,
};

#[derive(Default)]
struct LedgerTotals {
    opening_quantity: i64,
    opening_value: i64,
    purchases: i64,
    sales: i64,
    adjustments: i64,
    value_delta: i64,
}

pub struct DataIntegrityService;

impl DataIntegrityService {
    pub fn validate(conn: &Connection) -> AppResult<RestoreValidationResult> {
        let integrity: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        let mut issues = Vec::new();
        if integrity != "ok" {
            issues.push(Self::database_issue(
                "SQLITE_INTEGRITY",
                format!("SQLite integrity_check: {integrity}"),
            ));
        }
        let foreign_keys: i64 =
            conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })?;
        if foreign_keys > 0 {
            issues.push(Self::database_issue(
                "FOREIGN_KEY_ORPHAN",
                format!("Phát hiện {foreign_keys} tham chiếu khóa ngoại không hợp lệ."),
            ));
        }

        let mut totals: HashMap<i64, LedgerTotals> = HashMap::new();
        let mut baseline_dates: HashMap<i64, String> = HashMap::new();
        let mut baseline = conn.prepare(
            "SELECT l.product_id,l.closing_quantity,l.closing_value,j.cutover_date
             FROM legacy_inventory_summaries l JOIN import_jobs j ON j.id=l.import_job_id
             WHERE j.establishes_inventory_baseline=1 AND j.superseded_by IS NULL
               AND j.cutover_date=(SELECT MAX(j2.cutover_date) FROM legacy_inventory_summaries l2
                 JOIN import_jobs j2 ON j2.id=l2.import_job_id
                 WHERE l2.product_id=l.product_id AND j2.establishes_inventory_baseline=1
                   AND j2.superseded_by IS NULL)",
        )?;
        for row in baseline.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
            ))
        })? {
            let (id, quantity, value, date) = row?;
            totals.insert(
                id,
                LedgerTotals {
                    opening_quantity: quantity,
                    opening_value: value,
                    ..LedgerTotals::default()
                },
            );
            baseline_dates.insert(id, date);
        }

        let mut transaction_stmt = conn.prepare(
            "SELECT product_id,transaction_type,transaction_date,quantity_in,quantity_out,value_in,value_out
             FROM inventory_transactions WHERE transaction_type NOT IN ('opening_balance','legacy_opening')"
        )?;
        for row in transaction_stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
            ))
        })? {
            let (id, kind, date, quantity_in, quantity_out, value_in, value_out) = row?;
            if baseline_dates
                .get(&id)
                .is_some_and(|cutover| date <= *cutover)
            {
                continue;
            }
            let total = totals.entry(id).or_default();
            match kind.as_str() {
                "nhap" | "purchase" => total.purchases += quantity_in - quantity_out,
                "xuat" | "sale" => total.sales += quantity_out - quantity_in,
                _ => total.adjustments += quantity_in - quantity_out,
            }
            total.value_delta = total
                .value_delta
                .checked_add(value_in)
                .and_then(|v| v.checked_sub(value_out))
                .ok_or_else(|| AppError::Database("Inventory value overflow".to_string()))?;
        }

        let mut product_stmt = conn.prepare(
            "SELECT id,product_code,product_name,current_stock,current_inventory_value,average_cost FROM products"
        )?;
        for row in product_stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })? {
            let (id, code, name, stored_quantity, stored_value, average_cost) = row?;
            let has_ledger = totals.contains_key(&id);
            let total = totals.remove(&id).unwrap_or_default();
            let calculated_quantity = total
                .opening_quantity
                .checked_add(total.purchases)
                .and_then(|v| v.checked_sub(total.sales))
                .and_then(|v| v.checked_add(total.adjustments));
            let calculated_value = total.opening_value.checked_add(total.value_delta);
            let base = || InventoryReconciliationIssue {
                code: String::new(),
                severity: IntegritySeverity::Critical,
                product_id: Some(id),
                product_code: Some(code.clone()),
                product_name: Some(name.clone()),
                stored_quantity: Some(stored_quantity),
                calculated_quantity,
                difference_quantity: calculated_quantity
                    .and_then(|v| stored_quantity.checked_sub(v)),
                stored_value: Some(stored_value),
                calculated_value,
                opening_quantity: Some(total.opening_quantity),
                purchased_quantity: Some(total.purchases),
                sold_quantity: Some(total.sales),
                adjustment_quantity: Some(total.adjustments),
                unit_cost: Some(average_cost),
                explanation: String::new(),
            };
            let Some(calculated_quantity) = calculated_quantity else {
                let mut issue = base();
                issue.code = "INVENTORY_QUANTITY_OVERFLOW".into();
                issue.explanation = "Phép tính số lượng tồn kho vượt giới hạn INTEGER.".into();
                issues.push(issue);
                continue;
            };
            let Some(calculated_value) = calculated_value else {
                let mut issue = base();
                issue.code = "INVENTORY_VALUE_OVERFLOW".into();
                issue.explanation = "Phép tính giá trị tồn kho vượt giới hạn INTEGER.".into();
                issues.push(issue);
                continue;
            };
            if !has_ledger && (stored_quantity != 0 || stored_value != 0) {
                let mut issue = base();
                issue.code = "ORPHAN_CURRENT_STOCK".into();
                issue.explanation = "Sản phẩm có snapshot tồn kho nhưng không có baseline legacy hoặc giao dịch sổ kho giải thích số dư.".into();
                issues.push(issue);
            } else if stored_quantity != calculated_quantity || stored_value != calculated_value {
                let mut issue = base();
                issue.code = "INVENTORY_STOCK_MISMATCH".into();
                issue.explanation = format!("Tồn lưu ({stored_quantity}, {stored_value}đ) khác sổ kho ({calculated_quantity}, {calculated_value}đ). Không tự động sửa dữ liệu.");
                issues.push(issue);
            }
            if stored_quantity < 0 {
                let mut issue = base();
                issue.code = "NEGATIVE_STOCK".into();
                issue.severity = IntegritySeverity::Warning;
                issue.explanation = "Số lượng tồn âm là trạng thái nghiệp vụ/legacy; dữ liệu được giữ nguyên và cần kiểm tra.".into();
                issues.push(issue);
            }
            if stored_value < 0 {
                let mut issue = base();
                issue.code = "NEGATIVE_INVENTORY_VALUE".into();
                issue.severity = if stored_quantity < 0
                    && average_cost >= 0
                    && stored_value == stored_quantity.saturating_mul(average_cost)
                {
                    IntegritySeverity::Warning
                } else {
                    IntegritySeverity::Critical
                };
                issue.explanation = format!("Giá trị tồn {stored_value}đ; số lượng {stored_quantity}; đơn giá bình quân {average_cost}đ. Phân loại dựa trên dấu và quan hệ quantity × cost, không tự động đưa về 0.");
                issues.push(issue);
            }
        }
        for (product_id, total) in totals {
            let mut issue = Self::database_issue(
                "ORPHAN_CURRENT_STOCK",
                "Sổ kho có dòng tham chiếu sản phẩm không tồn tại.".into(),
            );
            issue.product_id = Some(product_id);
            issue.calculated_quantity =
                Some(total.opening_quantity + total.purchases - total.sales + total.adjustments);
            issues.push(issue);
        }
        let critical_count = issues
            .iter()
            .filter(|i| i.severity == IntegritySeverity::Critical)
            .count();
        let warning_count = issues
            .iter()
            .filter(|i| i.severity == IntegritySeverity::Warning)
            .count();
        Ok(RestoreValidationResult {
            can_commit: critical_count == 0,
            critical_count,
            warning_count,
            issues,
        })
    }

    pub fn health(conn: &Connection) -> AppResult<InventoryDataHealth> {
        let result = Self::validate(conn)?;
        let details = (!result.issues.is_empty()).then(|| {
            result
                .issues
                .iter()
                .map(|i| format!("{}: {}", i.code, i.explanation))
                .collect::<Vec<_>>()
                .join("\n")
        });
        Ok(InventoryDataHealth {
            is_healthy: result.critical_count == 0 && result.warning_count == 0,
            has_orphans: result
                .issues
                .iter()
                .any(|i| i.code == "ORPHAN_CURRENT_STOCK"),
            orphan_details: details,
            critical_count: result.critical_count,
            warning_count: result.warning_count,
            issues: result.issues,
        })
    }

    fn database_issue(code: &str, explanation: String) -> InventoryReconciliationIssue {
        InventoryReconciliationIssue {
            code: code.into(),
            severity: IntegritySeverity::Critical,
            product_id: None,
            product_code: None,
            product_name: None,
            stored_quantity: None,
            calculated_quantity: None,
            difference_quantity: None,
            stored_value: None,
            calculated_value: None,
            opening_quantity: None,
            purchased_quantity: None,
            sold_quantity: None,
            adjustment_quantity: None,
            unit_cost: None,
            explanation,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::database::migrations::run_migrations;

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    fn product(conn: &Connection, code: &str, quantity: i64, value: i64, cost: i64) -> i64 {
        conn.execute(
            "INSERT INTO products(product_code,product_name,animal_category,inventory_unit,current_stock,current_inventory_value,average_cost) VALUES(?1,'Test','Heo','Bao',?2,?3,?4)",
            rusqlite::params![code, quantity, value, cost],
        ).unwrap();
        conn.last_insert_rowid()
    }

    fn movement(
        conn: &Connection,
        id: i64,
        kind: &str,
        incoming: i64,
        outgoing: i64,
        value_in: i64,
        value_out: i64,
        stock_after: i64,
        value_after: i64,
    ) {
        conn.execute(
            "INSERT INTO inventory_transactions(transaction_date,product_id,transaction_type,source_type,source_id,quantity_in,quantity_out,unit_cost,stock_after,value_in,value_out,inventory_value_after) VALUES('2026-08-20',?1,?2,'test',1,?3,?4,100,?5,?6,?7,?8)",
            rusqlite::params![id, kind, incoming, outgoing, stock_after, value_in, value_out, value_after],
        ).unwrap();
    }

    #[test]
    fn healthy_ledger_reconciles_purchase_sale_and_adjustment() {
        let conn = database();
        let id = product(&conn, "HEALTHY", 135, 13_500, 100);
        movement(&conn, id, "purchase", 150, 0, 15_000, 0, 150, 15_000);
        movement(&conn, id, "sale", 0, 20, 0, 2_000, 130, 13_000);
        movement(
            &conn,
            id,
            "inventory_adjustment_in",
            5,
            0,
            500,
            0,
            135,
            13_500,
        );
        let result = DataIntegrityService::validate(&conn).unwrap();
        assert!(result.can_commit, "{:?}", result.issues);
        assert_eq!(result.critical_count, 0);
    }

    #[test]
    fn orphan_snapshot_is_critical_and_negative_legacy_state_is_warning() {
        let conn = database();
        product(&conn, "ORPHAN", 10, 1_000, 100);
        let negative = product(&conn, "NEG", -2, -200, 100);
        movement(&conn, negative, "sale", 0, 2, 0, 200, -2, -200);
        let result = DataIntegrityService::validate(&conn).unwrap();
        assert!(!result.can_commit);
        assert!(result
            .issues
            .iter()
            .any(|issue| issue.code == "ORPHAN_CURRENT_STOCK"
                && issue.severity == IntegritySeverity::Critical));
        assert!(result
            .issues
            .iter()
            .any(|issue| issue.code == "NEGATIVE_STOCK"
                && issue.severity == IntegritySeverity::Warning));
        assert!(result
            .issues
            .iter()
            .any(|issue| issue.code == "NEGATIVE_INVENTORY_VALUE"
                && issue.severity == IntegritySeverity::Warning));
    }
}
