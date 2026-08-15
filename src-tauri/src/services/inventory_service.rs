use crate::domain::errors::{AppError, AppResult};
use crate::domain::inventory_invariant::validate_inventory_state;
use crate::domain::inventory_transaction::{classify_transaction_type, InventoryTransactionClass};
use crate::domain::models::{
    CurrentInventoryRowDTO, DashboardAnalyticsDTO, DashboardQueryParams, InventoryDataHealth,
    InventoryTransaction, KpiMetric, ProductPriceHistoryPoint, StockAlertProduct, TopProductItem,
    TrendChartPoint,
};
use crate::infrastructure::database::connection::DbPool;
use crate::services::settings_service::SettingsService;
use rusqlite::{params, OptionalExtension};

#[derive(Clone)]
struct LegacyPeriodMetadata {
    job_id: i64,
    period_label: String,
    period_start: String,
    period_end: String,
    cutover_date: String,
    data_granularity: String,
    has_revenue_data: bool,
}

struct PeriodInventorySnapshot {
    rows: Vec<crate::domain::models::ImportExportReportRowDTO>,
    date_from: String,
    date_to: String,
    data_source: String,
    data_coverage: String,
    message: Option<String>,
    has_revenue_data: bool,
    revenue_coverage: String,
}

pub struct InventoryService {
    pool: DbPool,
}

impl InventoryService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn get_product_inventory_history(
        &self,
        product_id: i64,
        page: Option<i64>,
        page_size: Option<i64>,
    ) -> AppResult<Vec<InventoryTransaction>> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let page = page.unwrap_or(1).max(1);
        let page_size = page_size.unwrap_or(50).clamp(1, 200);
        let offset = (page - 1) * page_size;
        let mut stmt = conn.prepare(
            "SELECT t.id, t.transaction_date, t.product_id, p.product_code, p.product_name,
                    t.transaction_type, t.source_type, t.source_id, t.quantity_in, t.quantity_out,
                    t.unit_cost, t.stock_before, t.stock_after, t.old_average_cost,
                    t.new_average_cost, t.created_at
             FROM inventory_transactions t
             JOIN products p ON p.id = t.product_id
             WHERE t.product_id = ?1
             ORDER BY t.transaction_date DESC, t.id DESC LIMIT ?2 OFFSET ?3",
        )?;
        let rows = stmt.query_map(params![product_id, page_size, offset], |row| {
            Ok(InventoryTransaction {
                id: row.get(0)?,
                transaction_date: row.get(1)?,
                product_id: row.get(2)?,
                product_code: row.get(3)?,
                product_name: row.get(4)?,
                transaction_type: row.get(5)?,
                source_type: row.get(6)?,
                source_id: row.get(7)?,
                quantity_in: row.get(8)?,
                quantity_out: row.get(9)?,
                unit_cost: row.get(10)?,
                stock_before: row.get(11)?,
                stock_after: row.get(12)?,
                old_average_cost: row.get(13)?,
                new_average_cost: row.get(14)?,
                created_at: row.get(15)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn get_dashboard_analytics(
        &self,
        params: DashboardQueryParams,
    ) -> AppResult<DashboardAnalyticsDTO> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        // 1. Calculate Date Ranges (Current Period & Previous Period)
        let (date_from, date_to) = Self::resolve_date_range(&params)?;
        let period_snapshot =
            self.get_inventory_period_snapshot(Some(date_from.clone()), Some(date_to.clone()))?;
        let inventory_opening_quantity = period_snapshot
            .rows
            .iter()
            .map(|row| row.opening_stock)
            .sum();
        let inventory_opening_value = period_snapshot
            .rows
            .iter()
            .map(|row| row.opening_value)
            .sum();
        let inventory_in_quantity = period_snapshot
            .rows
            .iter()
            .map(|row| row.total_purchase_qty)
            .sum();
        let inventory_in_value = period_snapshot
            .rows
            .iter()
            .map(|row| row.purchase_value)
            .sum();
        let inventory_out_quantity = period_snapshot
            .rows
            .iter()
            .map(|row| row.total_sale_qty)
            .sum();
        let inventory_out_value = period_snapshot
            .rows
            .iter()
            .map(|row| row.sale_cost_value)
            .sum();
        let inventory_closing_quantity = period_snapshot
            .rows
            .iter()
            .map(|row| row.closing_stock)
            .sum();
        let inventory_closing_value = period_snapshot
            .rows
            .iter()
            .map(|row| row.closing_value)
            .sum();
        let revenue_coverage = period_snapshot.revenue_coverage.clone();
        let data_source = period_snapshot.data_source;
        let data_coverage = period_snapshot.data_coverage;
        let message = if revenue_coverage == "unavailable" {
            Some("Dữ liệu lịch sử của kỳ này chỉ gồm nhập – xuất – tồn theo giá vốn. Nguồn dữ liệu không có giá bán nên không thể xác định doanh thu và lợi nhuận.".to_string())
        } else if revenue_coverage == "partial" {
            Some(format!("Doanh thu chỉ bao gồm giao dịch được ghi nhận trong InveStock trong phần vận hành của kỳ {} – {}. Phần dữ liệu lịch sử trước đó không có giá bán.", date_from, date_to))
        } else {
            period_snapshot.message
        };
        let (prev_date_from, prev_date_to) = Self::calculate_previous_period(&date_from, &date_to)?;

        // 2. Sales Metrics (Current & Previous)
        let (cur_sales_total, cur_cogs, cur_profit, cur_sales_count): (i64, i64, i64, i64) = conn
            .query_row(
            "SELECT COALESCE(SUM(grand_total), 0), COALESCE(SUM(total_cost), 0), \
                        COALESCE(SUM(estimated_profit), 0), COUNT(*) \
                 FROM sales_invoices \
                 WHERE status = 'xac_nhan' AND invoice_date >= ?1 AND invoice_date <= ?2",
            [&date_from, &date_to],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;

        let (prev_sales_total, prev_cogs, prev_profit): (i64, i64, i64) = conn.query_row(
            "SELECT COALESCE(SUM(grand_total), 0), COALESCE(SUM(total_cost), 0), \
                    COALESCE(SUM(estimated_profit), 0) \
             FROM sales_invoices \
             WHERE status = 'xac_nhan' AND invoice_date >= ?1 AND invoice_date <= ?2",
            [&prev_date_from, &prev_date_to],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;

        // 3. Purchase Metrics (Current & Previous)
        let (cur_purchase_total, cur_purchase_count): (i64, i64) = conn.query_row(
            "SELECT COALESCE(SUM(i.inventory_cost_value), 0), COUNT(DISTINCT p.id) \
             FROM purchase_invoices p JOIN purchase_invoice_items i ON i.purchase_invoice_id=p.id \
             WHERE p.status = 'xac_nhan' AND p.invoice_date >= ?1 AND p.invoice_date <= ?2",
            [&date_from, &date_to],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;

        let prev_purchase_total: i64 = conn.query_row(
            "SELECT COALESCE(SUM(i.inventory_cost_value), 0) \
             FROM purchase_invoices p JOIN purchase_invoice_items i ON i.purchase_invoice_id=p.id \
             WHERE p.status = 'xac_nhan' AND p.invoice_date >= ?1 AND p.invoice_date <= ?2",
            [&prev_date_from, &prev_date_to],
            |r| r.get(0),
        )?;

        // 4. Current Stock & Debt Metrics (Snapshot)
        let current_stock_value: i64 = conn.query_row(
            "SELECT COALESCE(SUM(current_inventory_value), 0) FROM products WHERE active = 1",
            [],
            |r| r.get(0),
        )?;

        let current_stock_quantity: i64 = conn.query_row(
            "SELECT COALESCE(SUM(current_stock), 0) FROM products WHERE active = 1",
            [],
            |r| r.get(0),
        )?;

        let total_supplier_debt: i64 = conn.query_row(
            "SELECT COALESCE(SUM(remaining_amount), 0) FROM purchase_invoices WHERE status = 'xac_nhan' AND remaining_amount > 0",
            [],
            |r| r.get(0),
        )?;

        let (unpaid_invoices_count, oldest_unpaid_invoice_date): (i64, Option<String>) = conn.query_row(
            "SELECT COUNT(*), MIN(invoice_date) FROM purchase_invoices WHERE status = 'xac_nhan' AND remaining_amount > 0",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;

        // 5. Build KPI Metrics with Deltas
        let compare = params.compare_previous.unwrap_or(true);
        let net_revenue = Self::build_kpi_metric(
            cur_sales_total,
            if compare {
                Some(prev_sales_total)
            } else {
                None
            },
        );
        let cogs = Self::build_kpi_metric(cur_cogs, if compare { Some(prev_cogs) } else { None });
        let gross_profit =
            Self::build_kpi_metric(cur_profit, if compare { Some(prev_profit) } else { None });
        let purchase_value = Self::build_kpi_metric(
            cur_purchase_total,
            if compare {
                Some(prev_purchase_total)
            } else {
                None
            },
        );

        // 6. Trend Series (grouped by day, week, or month)
        let group_by = params.group_by.unwrap_or_else(|| "month".to_string());
        let trend_series = Self::query_trend_series(&conn, &date_from, &date_to, &group_by)?;

        // 7. Stock Alerts (Out of Stock & Low Stock under threshold)
        let low_stock_threshold = SettingsService::new(self.pool.clone())
            .get(String::new())?
            .low_stock_threshold;
        let negative_stock_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM products WHERE active = 1 AND current_stock < 0",
            [],
            |r| r.get(0),
        )?;
        let out_of_stock_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM products WHERE active = 1 AND current_stock = 0",
            [],
            |r| r.get(0),
        )?;
        let low_stock_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM products WHERE active = 1 AND current_stock > 0 AND current_stock <= ?1",
            [low_stock_threshold],
            |r| r.get(0),
        )?;

        let all_stock_alerts_preview = Self::query_stock_alerts_by_condition(
            &conn,
            "current_stock <= ?1 ORDER BY current_stock ASC, id ASC",
            &[&low_stock_threshold],
            low_stock_threshold,
        )?;
        let negative_stock_preview = Self::query_stock_alerts_by_condition(
            &conn,
            "current_stock < 0 ORDER BY current_stock ASC, id ASC",
            &[],
            low_stock_threshold,
        )?;
        let out_of_stock_preview = Self::query_stock_alerts_by_condition(
            &conn,
            "current_stock = 0 ORDER BY id ASC",
            &[],
            low_stock_threshold,
        )?;
        let low_stock_preview = Self::query_stock_alerts_by_condition(
            &conn,
            "current_stock > 0 AND current_stock <= ?1 ORDER BY current_stock ASC, id ASC",
            &[&low_stock_threshold],
            low_stock_threshold,
        )?;
        let stock_alerts_preview = all_stock_alerts_preview.clone();

        // 8. Top Products (Top Selling & Top Imported)
        let top_selling = Self::query_top_selling_products(&conn, &date_from, &date_to)?;
        let top_imported = Self::query_top_imported_products(&conn, &date_from, &date_to)?;

        // 9. Recent Transactions
        let recent_transactions = Self::query_recent_transactions(&conn, &date_from, &date_to)?;

        // 10. Rule-based Insights
        let insights = Self::generate_rule_based_insights(
            &net_revenue,
            &gross_profit,
            &purchase_value,
            cur_sales_total,
            cur_purchase_total,
            negative_stock_count,
            out_of_stock_count,
            low_stock_count,
            low_stock_threshold,
        );

        Ok(DashboardAnalyticsDTO {
            net_revenue,
            cogs,
            gross_profit,
            purchase_value,
            current_stock_value,
            current_stock_quantity,
            total_supplier_debt,
            unpaid_invoices_count,
            oldest_unpaid_invoice_date,
            purchase_count: cur_purchase_count,
            sales_count: cur_sales_count,
            trend_series,
            negative_stock_count,
            out_of_stock_count,
            low_stock_count,
            stock_alerts_preview,
            negative_stock_preview,
            out_of_stock_preview,
            low_stock_preview,
            all_stock_alerts_preview,
            top_selling,
            top_imported,
            recent_transactions,
            insights,
            resolved_date_from: date_from,
            resolved_date_to: date_to,
            snapshot_as_of: chrono_now_date(),
            data_source,
            data_coverage,
            message,
            revenue_coverage,
            inventory_opening_quantity,
            inventory_opening_value,
            inventory_in_quantity,
            inventory_in_value,
            inventory_out_quantity,
            inventory_out_value,
            inventory_closing_quantity,
            inventory_closing_value,
        })
    }

    // Helper: Resolve Date Range from Preset or Custom Strings
    fn resolve_date_range(params: &DashboardQueryParams) -> AppResult<(String, String)> {
        let today = chrono_now_date();
        let range = match params.preset.as_deref() {
            Some("today") => (today.clone(), today),
            Some("last_7_days") => (offset_date_days(&today, -6)?, today),
            Some("last_30_days") => (offset_date_days(&today, -29)?, today),
            Some("last_3_months") => (offset_date_months(&today, 3)?, today),
            Some("last_6_months") => (offset_date_months(&today, 6)?, today),
            Some("last_12_months") => (offset_date_months(&today, 12)?, today),
            Some("this_month") => (start_of_month(&today), today),
            Some("last_month") => (start_of_prev_month(&today)?, end_of_prev_month(&today)?),
            Some("this_quarter") => (start_of_quarter(&today)?, today),
            Some("this_year") => (format!("{}-01-01", &today[0..4]), today),
            Some("custom") | None => (
                params
                    .date_from
                    .clone()
                    .unwrap_or_else(|| start_of_month(&today)),
                params.date_to.clone().unwrap_or(today),
            ),
            _ => {
                return Err(AppError::Validation(
                    "Bộ lọc thời gian không hợp lệ.".into(),
                ))
            }
        };
        parse_date(&range.0)?;
        parse_date(&range.1)?;
        if range.0 > range.1 {
            return Err(AppError::Validation(
                "Từ ngày phải trước hoặc bằng đến ngày.".into(),
            ));
        }
        Ok(range)
    }

    // Helper: Calculate Previous Period Date Range with Equal Duration
    fn calculate_previous_period(from: &str, to: &str) -> AppResult<(String, String)> {
        let duration_days = calculate_days_between(from, to)?;
        let prev_to = offset_date_days(from, -1)?;
        let prev_from = offset_date_days(&prev_to, -(duration_days - 1))?;
        Ok((prev_from, prev_to))
    }

    // Helper: Build KpiMetric with Deltas
    fn build_kpi_metric(current: i64, previous_opt: Option<i64>) -> KpiMetric {
        if let Some(previous) = previous_opt {
            let change_amount = current - previous;
            let change_percent = if previous != 0 {
                ((current as f64 - previous as f64) / previous as f64) * 100.0
            } else {
                return KpiMetric {
                    current,
                    previous: Some(previous),
                    change_percent: None,
                    change_amount: Some(change_amount),
                };
            };
            KpiMetric {
                current,
                previous: Some(previous),
                change_percent: Some((change_percent * 10.0).round() / 10.0),
                change_amount: Some(change_amount),
            }
        } else {
            KpiMetric {
                current,
                previous: None,
                change_percent: None,
                change_amount: None,
            }
        }
    }

    // Query Trend Series by Grouping Format
    fn query_trend_series(
        conn: &rusqlite::Connection,
        date_from: &str,
        date_to: &str,
        group_by: &str,
    ) -> AppResult<Vec<TrendChartPoint>> {
        let date_fmt = match group_by {
            "day" => "%Y-%m-%d",
            "week" => "%Y-%W",
            _ => "%Y-%m",
        };

        let mut sales_stmt = conn.prepare(
            "SELECT strftime(?1, invoice_date) as grp, \
                    COALESCE(SUM(grand_total), 0), \
                    COALESCE(SUM(total_cost), 0), \
                    COALESCE(SUM(estimated_profit), 0) \
             FROM sales_invoices \
             WHERE status = 'xac_nhan' AND invoice_date >= ?2 AND invoice_date <= ?3 \
             GROUP BY grp ORDER BY grp ASC",
        )?;
        let sales_rows = sales_stmt.query_map([date_fmt, date_from, date_to], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, i64>(3)?,
            ))
        })?;

        let mut sales_map = std::collections::HashMap::new();
        for r in sales_rows.flatten() {
            sales_map.insert(r.0, (r.1, r.2, r.3));
        }

        let mut purchase_stmt = conn.prepare(
            "SELECT strftime(?1, p.invoice_date) as grp, COALESCE(SUM(i.inventory_cost_value), 0) \
             FROM purchase_invoices p JOIN purchase_invoice_items i ON i.purchase_invoice_id=p.id \
             WHERE p.status = 'xac_nhan' AND p.invoice_date >= ?2 AND p.invoice_date <= ?3 \
             GROUP BY grp ORDER BY grp ASC",
        )?;
        let purchase_rows = purchase_stmt.query_map([date_fmt, date_from, date_to], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })?;

        let mut purchase_map = std::collections::HashMap::new();
        for r in purchase_rows.flatten() {
            purchase_map.insert(r.0, r.1);
        }

        // Union of keys
        let mut keys: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
        for k in sales_map.keys() {
            keys.insert(k.clone());
        }
        for k in purchase_map.keys() {
            keys.insert(k.clone());
        }

        let mut series = Vec::new();
        for period in keys {
            let (sales_total, cost, profit) = *sales_map.get(&period).unwrap_or(&(0, 0, 0));
            let purchase_total = *purchase_map.get(&period).unwrap_or(&0);
            series.push(TrendChartPoint {
                period,
                purchase_total,
                sales_total,
                cost,
                profit,
            });
        }

        Ok(series)
    }

    fn query_stock_alerts_by_condition(
        conn: &rusqlite::Connection,
        condition_sql: &str,
        params: &[&dyn rusqlite::ToSql],
        low_stock_threshold: i64,
    ) -> AppResult<Vec<StockAlertProduct>> {
        let sql = format!(
            "SELECT id, product_code, product_name, current_stock, inventory_unit \
             FROM products \
             WHERE active = 1 AND {} \
             LIMIT 15",
            condition_sql
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params, |r| {
            let stock: i64 = r.get(3)?;
            let status = if stock < 0 {
                "negative_stock"
            } else if stock == 0 {
                "out_of_stock"
            } else {
                "low_stock"
            };
            Ok(StockAlertProduct {
                id: r.get(0)?,
                product_code: r.get(1)?,
                product_name: r.get(2)?,
                current_stock: stock,
                min_threshold: low_stock_threshold,
                status: status.to_string(),
                inventory_unit: r.get(4)?,
            })
        })?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    // Query Top Selling Products
    fn query_top_selling_products(
        conn: &rusqlite::Connection,
        date_from: &str,
        date_to: &str,
    ) -> AppResult<Vec<TopProductItem>> {
        let total_sales_val: i64 = conn.query_row(
            "SELECT COALESCE(SUM(item.line_revenue), 0) FROM sales_invoice_items item \
             JOIN sales_invoices s ON s.id = item.sales_invoice_id \
             WHERE s.status = 'xac_nhan' AND s.invoice_date >= ?1 AND s.invoice_date <= ?2",
            [date_from, date_to],
            |r| r.get(0),
        )?;

        let mut stmt = conn.prepare(
            "SELECT p.id, p.product_code, p.product_name, p.inventory_unit, \
                    COALESCE(SUM(item.quantity), 0) as total_qty, \
                    COALESCE(SUM(item.line_revenue), 0) as total_val \
             FROM sales_invoice_items item \
             JOIN sales_invoices s ON s.id = item.sales_invoice_id \
             JOIN products p ON p.id = item.product_id \
             WHERE s.status = 'xac_nhan' AND s.invoice_date >= ?1 AND s.invoice_date <= ?2 \
             GROUP BY p.id \
             ORDER BY total_val DESC, p.id ASC LIMIT 5",
        )?;

        let rows = stmt.query_map([date_from, date_to], |r| {
            let val: i64 = r.get(5)?;
            let share = if total_sales_val > 0 {
                ((val as f64 / total_sales_val as f64) * 100.0 * 10.0).round() / 10.0
            } else {
                0.0
            };
            Ok(TopProductItem {
                id: r.get(0)?,
                product_code: r.get(1)?,
                product_name: r.get(2)?,
                inventory_unit: r.get(3)?,
                total_quantity: r.get(4)?,
                total_value: val,
                share_percent: share,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // Query Top Imported Products
    fn query_top_imported_products(
        conn: &rusqlite::Connection,
        date_from: &str,
        date_to: &str,
    ) -> AppResult<Vec<TopProductItem>> {
        let total_purchase_val: i64 = conn.query_row(
            "SELECT COALESCE(SUM(item.inventory_cost_value), 0) FROM purchase_invoice_items item \
             JOIN purchase_invoices p ON p.id = item.purchase_invoice_id \
             WHERE p.status = 'xac_nhan' AND p.invoice_date >= ?1 AND p.invoice_date <= ?2",
            [date_from, date_to],
            |r| r.get(0),
        )?;

        let mut stmt = conn.prepare(
            "SELECT pr.id, pr.product_code, pr.product_name, pr.inventory_unit, \
                    COALESCE(SUM(item.quantity), 0) as total_qty, \
                    COALESCE(SUM(item.inventory_cost_value), 0) as total_val \
             FROM purchase_invoice_items item \
             JOIN purchase_invoices p ON p.id = item.purchase_invoice_id \
             JOIN products pr ON pr.id = item.product_id \
             WHERE p.status = 'xac_nhan' AND p.invoice_date >= ?1 AND p.invoice_date <= ?2 \
             GROUP BY pr.id \
             ORDER BY total_val DESC, pr.id ASC LIMIT 5",
        )?;

        let rows = stmt.query_map([date_from, date_to], |r| {
            let val: i64 = r.get(5)?;
            let share = if total_purchase_val > 0 {
                ((val as f64 / total_purchase_val as f64) * 100.0 * 10.0).round() / 10.0
            } else {
                0.0
            };
            Ok(TopProductItem {
                id: r.get(0)?,
                product_code: r.get(1)?,
                product_name: r.get(2)?,
                inventory_unit: r.get(3)?,
                total_quantity: r.get(4)?,
                total_value: val,
                share_percent: share,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // Query Recent Transactions
    fn query_recent_transactions(
        conn: &rusqlite::Connection,
        date_from: &str,
        date_to: &str,
    ) -> AppResult<Vec<InventoryTransaction>> {
        let mut stmt = conn.prepare(
            "SELECT t.id, t.transaction_date, t.product_id, p.product_code, p.product_name, \
                    t.transaction_type, t.source_type, t.source_id, t.quantity_in, t.quantity_out, \
                    t.unit_cost, t.stock_before, t.stock_after, t.old_average_cost, t.new_average_cost, \
                    t.created_at \
             FROM inventory_transactions t \
             JOIN products p ON p.id = t.product_id \
             WHERE t.transaction_date >= ?1 AND t.transaction_date <= ?2 \
               AND t.transaction_type NOT IN ('opening_balance','legacy_opening') \
             ORDER BY t.transaction_date DESC, t.id DESC LIMIT 10",
        )?;
        let rows = stmt.query_map([date_from, date_to], |r| {
            Ok(InventoryTransaction {
                id: r.get(0)?,
                transaction_date: r.get(1)?,
                product_id: r.get(2)?,
                product_code: r.get(3)?,
                product_name: r.get(4)?,
                transaction_type: r.get(5)?,
                source_type: r.get(6)?,
                source_id: r.get(7)?,
                quantity_in: r.get(8)?,
                quantity_out: r.get(9)?,
                unit_cost: r.get(10)?,
                stock_before: r.get(11)?,
                stock_after: r.get(12)?,
                old_average_cost: r.get(13)?,
                new_average_cost: r.get(14)?,
                created_at: r.get(15)?,
            })
        })?;
        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // Rule-based Insight Engine
    #[allow(clippy::too_many_arguments)]
    fn generate_rule_based_insights(
        net_revenue: &KpiMetric,
        gross_profit: &KpiMetric,
        purchase_value: &KpiMetric,
        cur_sales: i64,
        cur_purchases: i64,
        negative_count: i64,
        out_count: i64,
        low_count: i64,
        resolved_low_stock_threshold: i64,
    ) -> Vec<String> {
        let mut insights = Vec::new();

        if negative_count > 0 {
            insights.push(format!(
                "Cửa hàng đang có {} sản phẩm tồn kho âm, cần kiểm đếm và đối soát số liệu điều chỉnh.",
                negative_count
            ));
        }
        if out_count > 0 {
            insights.push(format!(
                "Hiện tại có {} sản phẩm đã hết hàng, cần lên kế hoạch nhập bổ sung ngay.",
                out_count
            ));
        }
        if low_count > 0 {
            insights.push(format!(
                "Có {} sản phẩm đang ở mức tồn kho thấp (dưới ngưỡng tối thiểu {} đơn vị).",
                low_count, resolved_low_stock_threshold
            ));
        }

        if let Some(pct) = net_revenue.change_percent {
            if pct > 0.0 {
                insights.push(format!(
                    "Doanh thu thuần kỳ này tăng {}% so với kỳ trước.",
                    pct
                ));
            } else if pct < 0.0 {
                insights.push(format!(
                    "Doanh thu thuần kỳ này giảm {}% so với kỳ trước.",
                    pct.abs()
                ));
            }
        }

        if let Some(pct) = purchase_value.change_percent {
            if pct > 10.0 {
                insights.push(format!(
                    "Giá trị nhập kho kỳ này gia tăng {}% so với kỳ trước.",
                    pct
                ));
            }
        }

        if let Some(pct) = gross_profit.change_percent {
            if pct < -5.0 {
                insights.push(format!("Cảnh báo: Lợi nhuận gộp giảm {}% so với kỳ trước, cần rà soát lại biến động giá vốn.", pct.abs()));
            }
        }

        if gross_profit.current < 0 {
            let margin = if net_revenue.current > 0 {
                gross_profit.current as f64 / net_revenue.current as f64 * 100.0
            } else {
                0.0
            };
            insights.push(format!(
                "Lợi nhuận gộp trong kỳ đang âm (biên lợi nhuận {:.1}%). Cần rà soát giá bán và giá vốn của các phiếu xuất.",
                margin
            ));
        }

        if cur_purchases > cur_sales && cur_sales > 0 {
            let ratio = cur_purchases as f64 / cur_sales as f64;
            insights.push(format!(
                "Giá trị nhập kho trong kỳ gấp {:.1} lần doanh thu ghi nhận. Theo dõi tốc độ bán và mức tồn sau nhập.",
                ratio
            ));
        } else if cur_purchases > 0 && cur_sales == 0 {
            insights
                .push("Trong kỳ có nhập kho nhưng chưa ghi nhận doanh thu xuất kho.".to_string());
        }

        if insights.is_empty() {
            insights.push(
                "Tình hình hoạt động kinh doanh và tồn kho hiện tại ở trạng thái ổn định."
                    .to_string(),
            );
        }

        insights
    }

    pub fn get_product_price_history(
        &self,
        product_id: i64,
    ) -> AppResult<Vec<ProductPriceHistoryPoint>> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT pi.received_date, pii.effective_unit_cost, pii.quantity, pi.receipt_code \
             FROM purchase_invoice_items pii \
             JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id \
             WHERE pii.product_id = ?1 AND pi.status = 'xac_nhan' \
             ORDER BY pi.received_date DESC, pi.id DESC, pii.id DESC LIMIT 24",
        )?;
        let rows = stmt.query_map([product_id], |r| {
            Ok(ProductPriceHistoryPoint {
                date: r.get(0)?,
                effective_unit_cost: r.get(1)?,
                quantity: r.get(2)?,
                receipt_code: r.get(3)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        result.reverse();
        Ok(result)
    }

    pub fn get_current_inventory(&self) -> AppResult<Vec<CurrentInventoryRowDTO>> {
        let conn = self
            .pool
            .get()
            .map_err(|error| AppError::Database(error.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, product_code, product_name, animal_category, inventory_unit, \
                    current_stock, average_cost, current_inventory_value, active, \
                    CASE \
                      WHEN current_stock != 0 AND current_inventory_value = 0 THEN 'missing' \
                      WHEN current_stock = 0 AND (current_inventory_value != 0 OR average_cost != 0) THEN 'inconsistent' \
                      WHEN current_stock > 0 AND current_inventory_value < 0 THEN 'inconsistent' \
                      WHEN COALESCE((SELECT t.stock_after FROM inventory_transactions t \
                                    WHERE t.product_id=products.id \
                                    ORDER BY t.transaction_date DESC,t.id DESC LIMIT 1),current_stock) != current_stock \
                        OR COALESCE((SELECT t.inventory_value_after FROM inventory_transactions t \
                                    WHERE t.product_id=products.id \
                                    ORDER BY t.transaction_date DESC,t.id DESC LIMIT 1),current_inventory_value) != current_inventory_value \
                        THEN 'inconsistent' \
                      ELSE 'known' END \
             FROM products \
             ORDER BY product_code ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(CurrentInventoryRowDTO {
                product_id: row.get(0)?,
                product_code: row.get(1)?,
                product_name: row.get(2)?,
                animal_category: row.get(3)?,
                inventory_unit: row.get(4)?,
                current_stock: row.get(5)?,
                average_cost: row.get(6)?,
                current_inventory_value: row.get(7)?,
                active: row.get::<_, i32>(8)? != 0,
                cost_data_status: row.get(9)?,
            })
        })?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    fn check_inconsistent_bootstrap(&self, conn: &rusqlite::Connection) -> AppResult<bool> {
        let non_zero_stock: i64 = conn.query_row(
            "SELECT COUNT(*) FROM products WHERE current_stock != 0",
            [],
            |r| r.get(0),
        )?;
        if non_zero_stock == 0 {
            return Ok(false);
        }

        let has_legacy: i64 =
            conn.query_row("SELECT COUNT(*) FROM import_jobs", [], |r| r.get(0))?;
        if has_legacy > 0 {
            return Ok(false);
        }

        let has_transactions: i64 =
            conn.query_row("SELECT COUNT(*) FROM inventory_transactions", [], |r| {
                r.get(0)
            })?;
        if has_transactions > 0 {
            return Ok(false);
        }

        Ok(true)
    }

    pub fn check_inventory_data_health(&self) -> AppResult<InventoryDataHealth> {
        let conn = self
            .pool
            .get()
            .map_err(|error| AppError::Database(error.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, product_code, product_name, current_stock, current_inventory_value FROM products",
        )?;

        let mut issues = Vec::new();
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })?;

        for r in rows {
            let (id, code, name, stock, val) = r?;

            let latest_tx: Option<(i64, i64)> = conn
                .query_row(
                    "SELECT stock_after, inventory_value_after \
                     FROM inventory_transactions \
                     WHERE product_id = ?1 \
                     ORDER BY transaction_date DESC, id DESC LIMIT 1",
                    [id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?;

            let tx_count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM inventory_transactions WHERE product_id = ?1",
                [id],
                |row| row.get(0),
            )?;

            let legacy_exists: i64 = conn.query_row(
                "SELECT COUNT(*) FROM legacy_inventory_summaries WHERE product_id = ?1",
                [id],
                |row| row.get(0),
            )?;

            if let Some((last_stock, last_val)) = latest_tx {
                if last_stock != stock {
                    issues.push(format!(
                        "STOCK_MISMATCH: '{}' ({}) current_stock={} != transaction stock_after={}",
                        name, code, stock, last_stock
                    ));
                }
                if last_val != val {
                    issues.push(format!(
                        "VALUE_MISMATCH: '{}' ({}) current_inventory_value={}đ != transaction inventory_value_after={}đ",
                        name, code, val, last_val
                    ));
                }
            } else if tx_count == 0 && legacy_exists == 0 && (stock != 0 || val != 0) {
                issues.push(format!(
                    "ORPHAN_CURRENT_STOCK: '{}' ({}) có tồn: {} bao, giá trị: {}đ",
                    name, code, stock, val
                ));
            }

            if stock > 0 && val == 0 {
                issues.push(format!(
                    "ZERO_VALUE_WITH_NONZERO_STOCK: '{}' ({}) tồn={} nhưng giá trị tồn=0đ",
                    name, code, stock
                ));
                if legacy_exists == 0
                    && latest_tx
                        .map(|(_, latest_value)| latest_value == 0)
                        .unwrap_or(true)
                {
                    issues.push(format!(
                        "MISSING_VALUE_SOURCE: '{}' ({}) chưa có nguồn giá trị tồn đáng tin cậy",
                        name, code
                    ));
                }
            }

            if val < 0 {
                issues.push(format!(
                    "NEGATIVE_INVENTORY_VALUE: '{}' ({}) giá trị tồn âm ({}đ)",
                    name, code, val
                ));
            }

            if stock == 0 && val != 0 {
                issues.push(format!(
                    "VALUE_MISMATCH: '{}' ({}) tồn bằng 0 nhưng giá trị tồn={}đ",
                    name, code, val
                ));
            }

            if stock != 0 && val != 0 {
                let expected_cost = ((i128::from(val).abs() + i128::from(stock).abs() / 2)
                    / i128::from(stock).abs()) as i64;
                let average_cost: i64 = conn.query_row(
                    "SELECT average_cost FROM products WHERE id=?1",
                    [id],
                    |row| row.get(0),
                )?;
                if average_cost != expected_cost {
                    issues.push(format!(
                        "VALUE_MISMATCH: '{}' ({}) average_cost={}đ, expected={}đ",
                        name, code, average_cost, expected_cost
                    ));
                }
            }
        }

        if !issues.is_empty() {
            Ok(InventoryDataHealth {
                is_healthy: false,
                has_orphans: true,
                orphan_details: Some(issues.join("\n")),
            })
        } else {
            Ok(InventoryDataHealth {
                is_healthy: true,
                has_orphans: false,
                orphan_details: None,
            })
        }
    }

    pub fn get_inventory_summary(
        &self,
        date_from: Option<String>,
        date_to: Option<String>,
    ) -> AppResult<crate::domain::models::PeriodResponse<crate::domain::models::InventorySummary>>
    {
        let snapshot = self.get_inventory_period_snapshot(date_from, date_to)?;
        let (earliest_data_date, latest_data_date) = self.inventory_data_range()?;
        let has_revenue_data = snapshot.has_revenue_data;
        let rows = snapshot
            .rows
            .into_iter()
            .map(|row| crate::domain::models::InventorySummary {
                product_id: row.product_id,
                product_code: row.product_code,
                product_name: row.product_name,
                animal_category: row.animal_category,
                inventory_unit: row.inventory_unit,
                opening_stock: row.opening_stock,
                total_in: row.total_purchase_qty,
                total_out: row.total_sale_qty,
                adjustment_quantity: row.adjustment_quantity,
                adjustment_value: row.adjustment_value,
                closing_stock: row.closing_stock,
                average_cost: row.closing_average_cost,
                stock_value: row.closing_value,
            })
            .collect();
        Ok(crate::domain::models::PeriodResponse {
            rows,
            resolved_date_from: snapshot.date_from,
            resolved_date_to: snapshot.date_to,
            data_source: snapshot.data_source,
            data_coverage: snapshot.data_coverage,
            message: snapshot.message,
            has_revenue_data,
            revenue_coverage: snapshot.revenue_coverage,
            earliest_data_date,
            latest_data_date,
        })
    }

    pub fn search_invoices(
        &self,
        params: crate::domain::models::ReportParamsInput,
    ) -> AppResult<crate::domain::models::PaginatedResult<crate::domain::models::InvoiceSearchRowDTO>>
    {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let df = params.date_from.unwrap_or_else(|| "1970-01-01".to_string());
        let dt = params.date_to.unwrap_or_else(|| "2099-12-31".to_string());
        let inv_type = params.invoice_type.unwrap_or_else(|| "all".to_string());
        let search = params
            .search
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty());
        let status = params
            .status
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty());

        let page = params.page.unwrap_or(1).max(1);
        let page_size = params.page_size.unwrap_or(20);

        let order_clause = match params.sort_by.as_deref() {
            Some("value_asc") => "grand_total ASC, invoice_date DESC, id DESC",
            Some("value_desc") => "grand_total DESC, invoice_date DESC, id DESC",
            Some("oldest") => "invoice_date ASC, id ASC",
            _ => "invoice_date DESC, id DESC",
        };

        let mut p_where = vec![
            "p.invoice_date >= ?".to_string(),
            "p.invoice_date <= ?".to_string(),
        ];
        if search.is_some() {
            p_where.push(
                "(p.receipt_code LIKE ? OR p.invoice_number LIKE ? OR s.company_name LIKE ? OR \
                 EXISTS (SELECT 1 FROM purchase_invoice_items pii JOIN products pr ON pr.id = pii.product_id WHERE pii.purchase_invoice_id = p.id AND (pr.product_name LIKE ? OR pr.product_code LIKE ?)))".to_string(),
            );
        }
        if status.is_some() {
            p_where.push("p.status = ?".to_string());
        }

        let mut s_where = vec![
            "s.invoice_date >= ?".to_string(),
            "s.invoice_date <= ?".to_string(),
        ];
        if search.is_some() {
            s_where.push(
                "(s.issue_code LIKE ? OR s.electronic_invoice_number LIKE ? OR s.buyer_name LIKE ? OR \
                 EXISTS (SELECT 1 FROM sales_invoice_items sii JOIN products pr ON pr.id = sii.product_id WHERE sii.sales_invoice_id = s.id AND (pr.product_name LIKE ? OR pr.product_code LIKE ?)))".to_string(),
            );
        }
        if status.is_some() {
            s_where.push("s.status = ?".to_string());
        }

        let fn_push_params = |vec: &mut Vec<Box<dyn rusqlite::ToSql>>| {
            vec.push(Box::new(df.clone()));
            vec.push(Box::new(dt.clone()));
            if let Some(s) = search {
                let pattern = format!("%{s}%");
                for _ in 0..5 {
                    vec.push(Box::new(pattern.clone()));
                }
            }
            if let Some(st) = status {
                vec.push(Box::new(st.to_string()));
            }
        };

        let mut p_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        fn_push_params(&mut p_params);

        let mut s_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        fn_push_params(&mut s_params);

        let p_select = format!(
            "SELECT p.id, 'purchase' as inv_type, p.receipt_code as document_code, p.invoice_number, p.invoice_date, \
                    s.company_name as partner_name, (SELECT COUNT(*) FROM purchase_invoice_items WHERE purchase_invoice_id = p.id) as item_count, \
                    p.grand_total, p.payment_status, p.status \
             FROM purchase_invoices p JOIN suppliers s ON s.id = p.supplier_id \
             WHERE {}",
            p_where.join(" AND ")
        );

        let s_select = format!(
            "SELECT s.id, 'sale' as inv_type, s.issue_code as document_code, s.electronic_invoice_number as invoice_number, s.invoice_date, \
                    COALESCE(s.buyer_name, 'Khách lẻ') as partner_name, (SELECT COUNT(*) FROM sales_invoice_items WHERE sales_invoice_id = s.id) as item_count, \
                    s.grand_total, 'not_tracked' as payment_status, s.status \
             FROM sales_invoices s \
             WHERE {}",
            s_where.join(" AND ")
        );

        let (union_sql, count_sql, query_params) = match inv_type.as_str() {
            "purchase" => (
                format!("{p_select} ORDER BY {order_clause} LIMIT ? OFFSET ?"),
                format!("SELECT COUNT(*) FROM purchase_invoices p JOIN suppliers s ON s.id = p.supplier_id WHERE {}", p_where.join(" AND ")),
                p_params,
            ),
            "sale" => (
                format!("{s_select} ORDER BY {order_clause} LIMIT ? OFFSET ?"),
                format!("SELECT COUNT(*) FROM sales_invoices s WHERE {}", s_where.join(" AND ")),
                s_params,
            ),
            _ => {
                let count_sql = format!(
                    "SELECT (SELECT COUNT(*) FROM purchase_invoices p JOIN suppliers s ON s.id = p.supplier_id WHERE {}) + \
                            (SELECT COUNT(*) FROM sales_invoices s WHERE {})",
                    p_where.join(" AND "),
                    s_where.join(" AND ")
                );
                let mut combined_params = Vec::new();
                fn_push_params(&mut combined_params);
                fn_push_params(&mut combined_params);
                (
                    format!("SELECT * FROM ({p_select} UNION ALL {s_select}) combined ORDER BY {order_clause} LIMIT ? OFFSET ?"),
                    count_sql,
                    combined_params,
                )
            }
        };

        // Execute count query
        let count_args: Vec<&dyn rusqlite::ToSql> =
            query_params.iter().map(|p| p.as_ref()).collect();
        let total: i64 = conn.query_row(
            &count_sql,
            rusqlite::params_from_iter(count_args.iter().copied()),
            |r| r.get(0),
        )?;

        // Execute paginated data query
        let mut fetch_params = query_params;
        let limit = page_size as i64;
        let offset = ((page - 1) * page_size) as i64;
        fetch_params.push(Box::new(limit));
        fetch_params.push(Box::new(offset));

        let data_args: Vec<&dyn rusqlite::ToSql> =
            fetch_params.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&union_sql)?;
        let items_iter =
            stmt.query_map(rusqlite::params_from_iter(data_args.iter().copied()), |r| {
                Ok(crate::domain::models::InvoiceSearchRowDTO {
                    id: r.get(0)?,
                    invoice_type: r.get(1)?,
                    document_code: r.get(2)?,
                    invoice_number: r.get(3)?,
                    invoice_date: r.get(4)?,
                    partner_name: r.get(5)?,
                    item_count: r.get(6)?,
                    grand_total: r.get(7)?,
                    payment_status: r.get(8)?,
                    status: r.get(9)?,
                })
            })?;

        let mut items = Vec::new();
        for row in items_iter {
            items.push(row?);
        }

        Ok(crate::domain::models::PaginatedResult {
            items,
            total,
            page: page as i64,
            page_size: page_size as i64,
        })
    }

    pub fn get_revenue_report(
        &self,
        params: crate::domain::models::ReportParamsInput,
    ) -> AppResult<crate::domain::models::RevenueSummaryDTO> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let df = params.date_from.unwrap_or_else(|| "1970-01-01".to_string());
        let dt = params.date_to.unwrap_or_else(|| "2099-12-31".to_string());

        let (total_revenue, total_cost, total_profit, invoice_count): (i64, i64, i64, i64) = conn
            .query_row(
            "SELECT COALESCE(SUM(grand_total), 0), COALESCE(SUM(total_cost), 0), \
                        COALESCE(SUM(estimated_profit), 0), COUNT(*) \
                 FROM sales_invoices \
                 WHERE status = 'xac_nhan' AND invoice_date >= ?1 AND invoice_date <= ?2",
            [&df, &dt],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;

        let mut stmt = conn.prepare(
            "SELECT strftime('%Y-%m', invoice_date) as period, \
                    COALESCE(SUM(grand_total), 0) as revenue, \
                    COALESCE(SUM(total_cost), 0) as cost, \
                    COALESCE(SUM(estimated_profit), 0) as profit \
             FROM sales_invoices \
             WHERE status = 'xac_nhan' AND invoice_date >= ?1 AND invoice_date <= ?2 \
             GROUP BY period ORDER BY period ASC",
        )?;

        let chart_rows = stmt.query_map([&df, &dt], |r| {
            Ok(crate::domain::models::RevenueChartPointDTO {
                period: r.get(0)?,
                revenue: r.get(1)?,
                cost: r.get(2)?,
                profit: r.get(3)?,
            })
        })?;

        let mut chart = Vec::new();
        for r in chart_rows {
            chart.push(r?);
        }

        Ok(crate::domain::models::RevenueSummaryDTO {
            total_revenue,
            total_cost,
            total_profit,
            invoice_count,
            chart,
        })
    }

    pub fn get_product_sales_report(
        &self,
        params: crate::domain::models::ReportParamsInput,
    ) -> AppResult<Vec<crate::domain::models::ProductSalesReportRowDTO>> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let df = params.date_from.unwrap_or_else(|| "1970-01-01".to_string());
        let dt = params.date_to.unwrap_or_else(|| "2099-12-31".to_string());

        let mut stmt = conn.prepare(
            "SELECT p.id, p.product_code, p.product_name, p.animal_category, p.inventory_unit, \
                    COALESCE(SUM(sii.quantity), 0) as qty_sold, \
                    COALESCE(SUM(sii.line_revenue), 0) as rev, \
                    COALESCE(SUM(sii.line_cost), 0) as cost, \
                    COALESCE(SUM(sii.estimated_profit), 0) as profit, \
                    COUNT(DISTINCT si.id) as inv_count \
             FROM sales_invoice_items sii \
             JOIN sales_invoices si ON si.id = sii.sales_invoice_id \
             JOIN products p ON p.id = sii.product_id \
             WHERE si.status = 'xac_nhan' AND si.invoice_date >= ?1 AND si.invoice_date <= ?2 \
             GROUP BY p.id \
             ORDER BY rev DESC",
        )?;

        let rows = stmt.query_map([&df, &dt], |r| {
            let qty: i64 = r.get(5)?;
            let rev: i64 = r.get(6)?;
            let cost: i64 = r.get(7)?;
            let profit: i64 = r.get(8)?;

            let avg_price = if qty > 0 { rev / qty } else { 0 };
            let margin = if rev > 0 {
                Some((profit as f64 / rev as f64) * 100.0)
            } else {
                None
            };

            Ok(crate::domain::models::ProductSalesReportRowDTO {
                product_id: r.get(0)?,
                product_code: r.get(1)?,
                product_name: r.get(2)?,
                animal_category: r.get(3)?,
                inventory_unit: r.get(4)?,
                quantity_sold: qty,
                revenue: rev,
                cost,
                profit,
                average_sale_price: avg_price,
                profit_margin: margin,
                invoice_count: r.get(9)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_supplier_debt_report(
        &self,
        _params: crate::domain::models::ReportParamsInput,
    ) -> AppResult<Vec<crate::domain::models::SupplierDebtReportRowDTO>> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut stmt = conn.prepare(
            "SELECT s.id, s.company_name, s.tax_code, s.phone, \
                    COUNT(DISTINCT pi.id) as inv_count, \
                    COALESCE(SUM(pi.grand_total), 0) as total_purchased, \
                    COALESCE(SUM(pi.paid_amount), 0) as total_paid, \
                    COALESCE(SUM(pi.remaining_amount), 0) as total_debt, \
                    MIN(CASE WHEN pi.remaining_amount > 0 THEN pi.invoice_date END) as oldest_unpaid, \
                    ( \
                        SELECT MAX(sp.payment_date) \
                        FROM supplier_payments sp \
                        JOIN purchase_invoices pinv ON pinv.id = sp.purchase_invoice_id \
                        WHERE pinv.supplier_id = s.id AND pinv.status = 'xac_nhan' AND sp.status = 'active' \
                    ) as last_payment \
             FROM suppliers s \
             LEFT JOIN purchase_invoices pi ON pi.supplier_id = s.id AND pi.status = 'xac_nhan' \
             WHERE s.active = 1 OR pi.id IS NOT NULL \
             GROUP BY s.id \
             ORDER BY total_debt DESC",
        )?;

        let rows = stmt.query_map([], |r| {
            Ok(crate::domain::models::SupplierDebtReportRowDTO {
                supplier_id: r.get(0)?,
                company_name: r.get(1)?,
                tax_code: r.get(2)?,
                phone: r.get(3)?,
                confirmed_invoice_count: r.get(4)?,
                total_purchased: r.get(5)?,
                total_paid: r.get(6)?,
                total_debt: r.get(7)?,
                oldest_unpaid_invoice_date: r.get(8)?,
                last_payment_date: r.get(9)?,
                snapshot_consistent: true,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_import_export_report(
        &self,
        params: crate::domain::models::ReportParamsInput,
    ) -> AppResult<
        crate::domain::models::PeriodResponse<crate::domain::models::ImportExportReportRowDTO>,
    > {
        let snapshot = self.get_inventory_period_snapshot(params.date_from, params.date_to)?;
        let (earliest_data_date, latest_data_date) = self.inventory_data_range()?;
        Ok(crate::domain::models::PeriodResponse {
            rows: snapshot.rows,
            resolved_date_from: snapshot.date_from,
            resolved_date_to: snapshot.date_to,
            data_source: snapshot.data_source,
            data_coverage: snapshot.data_coverage,
            message: snapshot.message,
            has_revenue_data: snapshot.has_revenue_data,
            revenue_coverage: snapshot.revenue_coverage,
            earliest_data_date,
            latest_data_date,
        })
    }

    fn inventory_data_range(&self) -> AppResult<(Option<String>, Option<String>)> {
        let conn = self
            .pool
            .get()
            .map_err(|error| AppError::Database(error.to_string()))?;
        conn.query_row(
            "SELECT MIN(event_date), MAX(event_date) FROM (
                 SELECT period_start AS event_date FROM import_jobs WHERE superseded_by IS NULL AND period_start IS NOT NULL
                 UNION ALL SELECT period_end FROM import_jobs WHERE superseded_by IS NULL AND period_end IS NOT NULL
                 UNION ALL SELECT transaction_date FROM inventory_transactions
             )",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(AppError::from)
    }

    pub fn get_report_data_range(&self) -> AppResult<crate::domain::models::ReportDataRange> {
        let (earliest, latest) = self.inventory_data_range()?;
        Ok(crate::domain::models::ReportDataRange {
            earliest_data_date: earliest,
            latest_data_date: latest,
        })
    }

    fn get_inventory_period_snapshot(
        &self,
        date_from: Option<String>,
        date_to: Option<String>,
    ) -> AppResult<PeriodInventorySnapshot> {
        let date_from = date_from.unwrap_or_else(|| start_of_month(&chrono_now_date()));
        let date_to = date_to.unwrap_or_else(chrono_now_date);
        if chrono::NaiveDate::parse_from_str(&date_from, "%Y-%m-%d").is_err()
            || chrono::NaiveDate::parse_from_str(&date_to, "%Y-%m-%d").is_err()
            || date_from > date_to
        {
            return Err(AppError::Validation("Khoảng ngày không hợp lệ".to_string()));
        }
        let conn = self
            .pool
            .get()
            .map_err(|error| AppError::Database(error.to_string()))?;
        let periods = Self::active_legacy_periods(&conn)?;
        let overlapping_periods: Vec<&LegacyPeriodMetadata> = periods
            .iter()
            .filter(|period| date_from <= period.period_end && date_to >= period.period_start)
            .collect();
        if overlapping_periods.len() > 1 {
            return Ok(PeriodInventorySnapshot {
                rows: Vec::new(),
                date_from,
                date_to,
                data_source: "legacy".to_string(),
                data_coverage: "incomplete".to_string(),
                message: Some("Khoảng ngày chọn bao phủ nhiều giai đoạn dữ liệu lịch sử tổng hợp. Hệ thống chưa hỗ trợ gộp nhiều kỳ lịch sử khác nhau.".to_string()),
                has_revenue_data: false,
                revenue_coverage: "unavailable".into(),
            });
        }
        if let Some(period) = periods
            .iter()
            .find(|period| period.period_start == date_from && period.period_end == date_to)
        {
            return Ok(PeriodInventorySnapshot {
                rows: Self::query_legacy_rows(&conn, period.job_id)?,
                date_from,
                date_to,
                data_source: "legacy".to_string(),
                data_coverage: "complete".to_string(),
                message: Some(format!(
                    "{} – dữ liệu tổng hợp từ hệ thống cũ",
                    period.period_label
                )),
                has_revenue_data: period.has_revenue_data,
                revenue_coverage: if period.has_revenue_data {
                    "complete"
                } else {
                    "unavailable"
                }
                .into(),
            });
        }
        if let Some(earliest) = periods.first() {
            if date_to < earliest.period_start {
                return Ok(PeriodInventorySnapshot {
                rows: Vec::new(),
                date_from,
                date_to,
                data_source: "legacy".to_string(),
                data_coverage: "incomplete".to_string(),
                message: Some(format!("Dữ liệu nguồn không có chi tiết nhập/xuất trước {}. Hệ thống chỉ biết số dư mở đầu của kỳ lịch sử đầu tiên.",earliest.period_start)),
                has_revenue_data:false,
                revenue_coverage:"unavailable".into(),
            });
            }
        }
        if let Some(period) = periods
            .iter()
            .find(|period| date_from <= period.period_end && date_to >= period.period_start)
        {
            if date_from == period.period_start && date_to > period.period_end {
                return Ok(PeriodInventorySnapshot {
                    rows: Self::query_operational_period_rows(
                        &conn,
                        &next_date(&period.cutover_date),
                        &date_to,
                        Some(period),
                        true,
                    )?,
                    date_from,
                    date_to,
                    data_source: "mixed".into(),
                    data_coverage: "complete".into(),
                    message: Some(format!(
                        "Kết hợp {} và giao dịch InveStock sau ngày {}",
                        period.period_label, period.cutover_date
                    )),
                    has_revenue_data: period.has_revenue_data,
                    revenue_coverage: if period.has_revenue_data {
                        "complete"
                    } else {
                        "partial"
                    }
                    .into(),
                });
            }
            return Ok(PeriodInventorySnapshot {
                rows: Vec::new(),
                date_from,
                date_to,
                data_source: "legacy".to_string(),
                data_coverage: "summary_only".to_string(),
                message: Some(format!("Dữ liệu lịch sử của giai đoạn này chỉ được lưu ở mức {}. Không thể xác định chính xác riêng khoảng ngày đã chọn.",period.data_granularity)),
                has_revenue_data:false,
                revenue_coverage:"unavailable".into(),
            });
        }
        let baseline = periods
            .iter()
            .filter(|period| period.cutover_date < date_from)
            .max_by_key(|period| &period.cutover_date);
        let is_inconsistent = self.check_inconsistent_bootstrap(&conn)?;
        let (data_coverage, message) = if is_inconsistent {
            ("incomplete".to_string(), Some("Dữ liệu tồn hiện tại tồn tại nhưng chưa có lịch sử khởi tạo. Hãy khôi phục dữ liệu khởi tạo hoặc thực hiện chuyển đổi dữ liệu.".to_string()))
        } else {
            ("complete".to_string(), None)
        };

        Ok(PeriodInventorySnapshot {
            rows: Self::query_operational_period_rows(
                &conn, &date_from, &date_to, baseline, false,
            )?,
            date_from,
            date_to,
            data_source: "operational".to_string(),
            data_coverage,
            message,
            has_revenue_data: true,
            revenue_coverage: "complete".into(),
        })
    }

    fn active_legacy_periods(conn: &rusqlite::Connection) -> AppResult<Vec<LegacyPeriodMetadata>> {
        let mut statement=conn.prepare("SELECT id,COALESCE(sheet_name,''),period_start,period_end,cutover_date,COALESCE(data_granularity,'summary'),has_revenue_data FROM import_jobs WHERE establishes_inventory_baseline=1 AND superseded_by IS NULL AND period_start IS NOT NULL AND period_end IS NOT NULL ORDER BY period_start")?;
        let rows = statement.query_map([], |row| {
            Ok(LegacyPeriodMetadata {
                job_id: row.get(0)?,
                period_label: row.get(1)?,
                period_start: row.get(2)?,
                period_end: row.get(3)?,
                cutover_date: row.get(4)?,
                data_granularity: row.get(5)?,
                has_revenue_data: row.get::<_, i64>(6)? != 0,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    fn query_legacy_rows(
        conn: &rusqlite::Connection,
        job_id: i64,
    ) -> AppResult<Vec<crate::domain::models::ImportExportReportRowDTO>> {
        let mut statement = conn.prepare(
            "SELECT p.id,p.product_code,p.product_name,p.animal_category,p.inventory_unit,
                    l.opening_quantity,l.opening_value,l.purchase_quantity,l.purchase_value,
                    l.sale_quantity,l.sale_value,l.closing_quantity,l.closing_unit_cost,l.closing_value
             FROM legacy_inventory_summaries l JOIN products p ON p.id=l.product_id
             WHERE l.import_job_id=?1 ORDER BY p.product_code",
        )?;
        let rows = statement.query_map([job_id], |row| {
            Ok(crate::domain::models::ImportExportReportRowDTO {
                product_id: row.get(0)?,
                product_code: row.get(1)?,
                product_name: row.get(2)?,
                animal_category: row.get(3)?,
                inventory_unit: row.get(4)?,
                opening_stock: row.get(5)?,
                opening_value: row.get(6)?,
                total_purchase_qty: row.get(7)?,
                purchase_value: row.get(8)?,
                total_sale_qty: row.get(9)?,
                sale_cost_value: row.get(10)?,
                adjustment_quantity: 0,
                adjustment_value: 0,
                closing_stock: row.get(11)?,
                closing_average_cost: row.get(12)?,
                closing_value: row.get(13)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    fn query_operational_period_rows(
        conn: &rusqlite::Connection,
        date_from: &str,
        date_to: &str,
        baseline_period: Option<&LegacyPeriodMetadata>,
        include_legacy: bool,
    ) -> AppResult<Vec<crate::domain::models::ImportExportReportRowDTO>> {
        let baseline_job_id = baseline_period.map(|period| period.job_id).unwrap_or(-1);
        let cutover = baseline_period
            .map(|period| period.cutover_date.as_str())
            .unwrap_or("0000-01-01");
        let mut statement = conn.prepare(
            "SELECT p.id,p.product_code,p.product_name,p.animal_category,p.inventory_unit,
                    COALESCE(l.opening_quantity,0),COALESCE(l.opening_value,0),
                    COALESCE(l.purchase_quantity,0),COALESCE(l.purchase_value,0),
                    COALESCE(l.sale_quantity,0),COALESCE(l.sale_value,0),
                    COALESCE(l.closing_quantity,0),COALESCE(l.closing_unit_cost,0),COALESCE(l.closing_value,0)
             FROM products p LEFT JOIN legacy_inventory_summaries l
               ON l.product_id=p.id AND l.import_job_id=?1
             ORDER BY p.product_code",
        )?;
        let products = statement
            .query_map([baseline_job_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, i64>(10)?,
                    row.get::<_, i64>(11)?,
                    row.get::<_, i64>(12)?,
                    row.get::<_, i64>(13)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let mut result = Vec::with_capacity(products.len());
        for (
            id,
            code,
            name,
            category,
            unit,
            legacy_opening,
            legacy_opening_value,
            legacy_purchase,
            legacy_purchase_value,
            legacy_sale,
            legacy_sale_value,
            baseline,
            baseline_cost,
            baseline_value,
        ) in products
        {
            let pre_delta: i64 = conn.query_row(
                "SELECT COALESCE(SUM(quantity_in-quantity_out),0) FROM inventory_transactions WHERE product_id=?1 AND transaction_type NOT IN ('legacy_opening','opening_balance') AND transaction_date>?2 AND transaction_date<?3",
                params![id, cutover, date_from], |row| row.get(0))?;
            let pre_value_delta:i64=conn.query_row("SELECT COALESCE(SUM(value_in-value_out),0) FROM inventory_transactions WHERE product_id=?1 AND transaction_type NOT IN ('legacy_opening','opening_balance') AND transaction_date>?2 AND transaction_date<?3",params![id,cutover,date_from],|row|row.get(0))?;
            let mut period_in = 0_i64;
            let mut purchase_value = 0_i64;
            let mut period_out = 0_i64;
            let mut sale_value = 0_i64;
            let mut adjustment_quantity = 0_i64;
            let mut adjustment_value = 0_i64;
            let mut transaction_statement = conn.prepare(
                "SELECT transaction_type,quantity_in,quantity_out,value_in,value_out
                   FROM inventory_transactions
                  WHERE product_id=?1 AND transaction_date>=?2 AND transaction_date<=?3",
            )?;
            let transactions =
                transaction_statement.query_map(params![id, date_from, date_to], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, i64>(4)?,
                    ))
                })?;
            for transaction in transactions {
                let (kind, quantity_in, quantity_out, value_in, value_out) = transaction?;
                match classify_transaction_type(&kind) {
                    InventoryTransactionClass::Purchase => {
                        period_in += quantity_in;
                        purchase_value += value_in;
                    }
                    InventoryTransactionClass::Sale => {
                        period_out += quantity_out;
                        sale_value += value_out;
                    }
                    InventoryTransactionClass::Adjustment => {
                        adjustment_quantity += quantity_in - quantity_out;
                        adjustment_value += value_in - value_out;
                    }
                    InventoryTransactionClass::Opening => {}
                }
            }
            let operational_opening = baseline + pre_delta;
            let opening_stock = if include_legacy {
                legacy_opening
            } else {
                operational_opening
            };
            let opening_value = if include_legacy {
                legacy_opening_value
            } else {
                baseline_value + pre_value_delta
            };
            let opening_cost = if include_legacy {
                if legacy_opening == 0 {
                    0
                } else {
                    (legacy_opening_value as f64 / legacy_opening as f64)
                        .abs()
                        .round() as i64
                }
            } else if opening_stock != 0 {
                (opening_value as f64 / opening_stock as f64).abs().round() as i64
            } else {
                baseline_cost
            };
            let total_purchase_qty = period_in + if include_legacy { legacy_purchase } else { 0 };
            let total_sale_qty = period_out + if include_legacy { legacy_sale } else { 0 };
            let closing_stock = if include_legacy {
                baseline + period_in - period_out + adjustment_quantity
            } else {
                operational_opening + period_in - period_out + adjustment_quantity
            };
            let closing_value = if include_legacy {
                baseline_value + purchase_value - sale_value + adjustment_value
            } else {
                opening_value + purchase_value - sale_value + adjustment_value
            };
            let closing_cost = if closing_stock != 0 {
                (closing_value as f64 / closing_stock as f64).abs().round() as i64
            } else {
                opening_cost
            };
            result.push(crate::domain::models::ImportExportReportRowDTO {
                product_id: id,
                product_code: code,
                product_name: name,
                animal_category: category,
                inventory_unit: unit,
                opening_stock,
                opening_value,
                total_purchase_qty,
                purchase_value: purchase_value
                    + if include_legacy {
                        legacy_purchase_value
                    } else {
                        0
                    },
                total_sale_qty,
                sale_cost_value: sale_value + if include_legacy { legacy_sale_value } else { 0 },
                adjustment_quantity,
                adjustment_value,
                closing_stock,
                closing_average_cost: closing_cost,
                closing_value,
            });
        }
        Ok(result)
    }

    pub fn create_adjustment(
        &self,
        input: crate::domain::models::CreateInventoryAdjustmentInput,
    ) -> AppResult<crate::domain::models::InventoryAdjustmentDTO> {
        if input.actual_stock < 0 {
            return Err(AppError::Validation(
                "Tồn thực tế không được nhỏ hơn 0.".to_string(),
            ));
        }
        if input.adjustment_unit_cost.is_some_and(|cost| cost < 0) {
            return Err(AppError::Validation(
                "Giá vốn điều chỉnh không được nhỏ hơn 0.".to_string(),
            ));
        }
        if !["kiem_ke", "hong_mat", "nhap_sai", "xuat_sai", "khac"].contains(&input.reason.as_str())
        {
            return Err(AppError::Validation(
                "Lý do điều chỉnh không hợp lệ.".to_string(),
            ));
        }
        let mut conn = self
            .pool
            .get()
            .map_err(|error| AppError::Database(error.to_string()))?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;

        let (current_stock, current_inventory_value, average_cost, product_code, product_name): (i64, i64, i64, String, String) = tx.query_row(
            "SELECT current_stock, current_inventory_value, average_cost, product_code, product_name FROM products WHERE id = ?1",
            params![input.product_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        ).map_err(|_| AppError::NotFound("Không tìm thấy sản phẩm.".to_string()))?;

        let difference = input.actual_stock - current_stock;
        if difference == 0 {
            return Err(AppError::Validation(
                "Số lượng thực tế bằng số lượng trên hệ thống, không cần điều chỉnh.".to_string(),
            ));
        }

        let mut quantity_in = 0;
        let mut value_in = 0;
        let mut quantity_out = 0;
        let mut value_out = 0;
        let mut trans_type = "inventory_adjustment_in";

        if difference < 0 {
            if current_stock <= 0 {
                return Err(AppError::Validation(
                    "Không thể giảm thêm khi tồn kho hệ thống bằng hoặc nhỏ hơn 0.".to_string(),
                ));
            }
            trans_type = "inventory_adjustment_out";
            quantity_out = -difference;
            value_out = if input.actual_stock == 0 {
                current_inventory_value
            } else {
                ((current_inventory_value as i128 * quantity_out as i128) / current_stock as i128)
                    as i64
            };
        } else {
            quantity_in = difference;
            let unit_cost = match input.adjustment_unit_cost {
                Some(cost) => cost,
                None if average_cost > 0 => average_cost,
                None => {
                    return Err(AppError::Validation(
                        "Vui lòng nhập giá vốn cho phần tồn kho tăng thêm.".to_string(),
                    ))
                }
            };
            value_in = quantity_in.checked_mul(unit_cost).ok_or_else(|| {
                AppError::Validation("Giá trị điều chỉnh vượt phạm vi hỗ trợ.".to_string())
            })?;
        }

        let new_stock = current_stock + difference;
        let new_inventory_value = current_inventory_value
            .checked_add(value_in)
            .and_then(|value| value.checked_sub(value_out))
            .ok_or_else(|| {
                AppError::Validation("Giá trị tồn kho vượt phạm vi hỗ trợ.".to_string())
            })?;
        let new_average_cost = if new_stock != 0 {
            (new_inventory_value as f64 / new_stock as f64)
                .abs()
                .round() as i64
        } else {
            0
        };
        validate_inventory_state(new_stock, new_inventory_value, new_average_cost, false)?;

        tx.execute(
            "INSERT INTO inventory_adjustments (
                product_id, system_stock, actual_stock, difference, reason, notes, adjustment_date, adjustment_unit_cost
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                input.product_id,
                current_stock,
                input.actual_stock,
                difference,
                input.reason,
                input.notes,
                input.adjustment_date,
                input.adjustment_unit_cost,
            ],
        )?;

        let adjustment_id = tx.last_insert_rowid();

        tx.execute(
            "UPDATE products SET
                current_stock = ?1,
                current_inventory_value = ?2,
                average_cost = ?3,
                updated_at = datetime('now', 'localtime')
             WHERE id = ?4",
            params![
                new_stock,
                if new_stock == 0 {
                    0
                } else {
                    new_inventory_value
                },
                new_average_cost,
                input.product_id,
            ],
        )?;

        tx.execute(
            "INSERT INTO inventory_transactions (
                transaction_date, product_id, transaction_type, source_type, source_id,
                quantity_in, quantity_out, unit_cost, stock_before, stock_after,
                old_average_cost, new_average_cost, value_in, value_out,
                inventory_value_before, inventory_value_after
            ) VALUES (?1, ?2, ?3, 'inventory_adjustment', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                input.adjustment_date,
                input.product_id,
                trans_type,
                adjustment_id,
                quantity_in,
                quantity_out,
                if difference > 0 { input.adjustment_unit_cost.unwrap_or(average_cost) } else { average_cost },
                current_stock,
                new_stock,
                average_cost,
                new_average_cost,
                value_in,
                value_out,
                current_inventory_value,
                if new_stock == 0 { 0 } else { new_inventory_value },
            ],
        )?;

        tx.commit()?;

        let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        Ok(crate::domain::models::InventoryAdjustmentDTO {
            id: adjustment_id,
            product_id: input.product_id,
            product_code,
            product_name,
            system_stock: current_stock,
            actual_stock: input.actual_stock,
            difference,
            reason: input.reason,
            notes: input.notes,
            adjustment_date: input.adjustment_date,
            adjustment_unit_cost: input.adjustment_unit_cost,
            created_at,
        })
    }

    pub fn list_adjustments(
        &self,
    ) -> AppResult<Vec<crate::domain::models::InventoryAdjustmentDTO>> {
        let conn = self
            .pool
            .get()
            .map_err(|error| AppError::Database(error.to_string()))?;
        let mut statement = conn.prepare(
            "SELECT a.id, a.product_id, p.product_code, p.product_name,
                    a.system_stock, a.actual_stock, a.difference,
                    a.reason, a.notes, a.adjustment_date, a.adjustment_unit_cost, a.created_at
             FROM inventory_adjustments a
             JOIN products p ON p.id = a.product_id
             ORDER BY a.created_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(crate::domain::models::InventoryAdjustmentDTO {
                id: row.get(0)?,
                product_id: row.get(1)?,
                product_code: row.get(2)?,
                product_name: row.get(3)?,
                system_stock: row.get(4)?,
                actual_stock: row.get(5)?,
                difference: row.get(6)?,
                reason: row.get(7)?,
                notes: row.get(8)?,
                adjustment_date: row.get(9)?,
                adjustment_unit_cost: row.get(10)?,
                created_at: row.get(11)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }
}

// ─────────────────────────────────────────────
// Date Math Helper Functions (Pure Rust Strings)
// ─────────────────────────────────────────────

fn chrono_now_date() -> String {
    chrono::Local::now()
        .date_naive()
        .format("%Y-%m-%d")
        .to_string()
}

fn next_date(date: &str) -> String {
    chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .ok()
        .and_then(|value| value.succ_opt())
        .map(|value| value.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| date.to_string())
}

fn start_of_month(date_str: &str) -> String {
    if date_str.len() >= 7 {
        format!("{}-01", &date_str[0..7])
    } else {
        date_str.to_string()
    }
}

fn start_of_prev_month(date_str: &str) -> AppResult<String> {
    let date = parse_date(date_str)?;
    let previous = date
        .checked_sub_months(chrono::Months::new(1))
        .ok_or_else(|| AppError::Validation("Ngày nằm ngoài phạm vi hỗ trợ.".into()))?;
    Ok(previous.format("%Y-%m-01").to_string())
}

fn end_of_prev_month(date_str: &str) -> AppResult<String> {
    let current_month_start = parse_date(&start_of_month(date_str))?;
    let previous = current_month_start
        .pred_opt()
        .ok_or_else(|| AppError::Validation("Ngày nằm ngoài phạm vi hỗ trợ.".into()))?;
    Ok(previous.format("%Y-%m-%d").to_string())
}

fn start_of_quarter(date_str: &str) -> AppResult<String> {
    use chrono::Datelike;
    let date = parse_date(date_str)?;
    let y = date.year();
    let m = date.month();
    let q_start_month = match m {
        1..=3 => 1,
        4..=6 => 4,
        7..=9 => 7,
        _ => 10,
    };
    Ok(format!("{:04}-{:02}-01", y, q_start_month))
}

fn parse_date(date_str: &str) -> AppResult<chrono::NaiveDate> {
    chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d").map_err(|_| {
        AppError::Validation(format!(
            "Ngày '{date_str}' không hợp lệ. Vui lòng dùng định dạng YYYY-MM-DD."
        ))
    })
}

fn calculate_days_between(from: &str, to: &str) -> AppResult<i64> {
    let from_date = parse_date(from)?;
    let to_date = parse_date(to)?;
    Ok((to_date.signed_duration_since(from_date).num_days() + 1).max(1))
}

fn offset_date_days(date_str: &str, offset_days: i64) -> AppResult<String> {
    let date = parse_date(date_str)?;
    let shifted = date
        .checked_add_signed(chrono::Duration::days(offset_days))
        .ok_or_else(|| AppError::Validation("Ngày nằm ngoài phạm vi hỗ trợ.".into()))?;
    Ok(shifted.format("%Y-%m-%d").to_string())
}

fn offset_date_months(date_str: &str, months: u32) -> AppResult<String> {
    parse_date(date_str)?
        .checked_sub_months(chrono::Months::new(months))
        .map(|date| date.format("%Y-%m-%d").to_string())
        .ok_or_else(|| AppError::Validation("Ngày nằm ngoài phạm vi hỗ trợ.".into()))
}

#[cfg(test)]
mod dashboard_date_tests {
    use super::*;

    #[test]
    fn custom_dashboard_range_uses_selected_dates() {
        let params = DashboardQueryParams {
            preset: Some("custom".to_string()),
            date_from: Some("2026-06-01".to_string()),
            date_to: Some("2026-06-30".to_string()),
            group_by: Some("day".to_string()),
            compare_previous: Some(true),
        };

        assert_eq!(
            InventoryService::resolve_date_range(&params).unwrap(),
            ("2026-06-01".to_string(), "2026-06-30".to_string())
        );
    }

    #[test]
    fn previous_dashboard_range_has_the_same_inclusive_length() {
        assert_eq!(
            InventoryService::calculate_previous_period("2026-06-01", "2026-06-30").unwrap(),
            ("2026-05-02".to_string(), "2026-05-31".to_string())
        );
    }

    #[test]
    fn invalid_dashboard_date_is_rejected() {
        let params = DashboardQueryParams {
            preset: Some("custom".to_string()),
            date_from: Some("2026-02-30".to_string()),
            date_to: Some("2026-03-01".to_string()),
            group_by: Some("day".to_string()),
            compare_previous: Some(false),
        };

        assert!(matches!(
            InventoryService::resolve_date_range(&params),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn comparison_from_zero_does_not_invent_a_percentage() {
        let increase = InventoryService::build_kpi_metric(600_000, Some(0));
        assert_eq!(increase.previous, Some(0));
        assert_eq!(increase.change_amount, Some(600_000));
        assert_eq!(increase.change_percent, None);

        let loss = InventoryService::build_kpi_metric(-400_000, Some(0));
        assert_eq!(loss.change_amount, Some(-400_000));
        assert_eq!(loss.change_percent, None);
    }
}
