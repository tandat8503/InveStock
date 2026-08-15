use crate::domain::errors::{AppError, AppResult};
use crate::domain::inventory_invariant::validate_inventory_state;
use crate::domain::models::{CreateSalesInvoiceInput, SalesInvoice, SalesInvoiceItem};
use crate::domain::validation::{iso_date, one_of, positive};
use crate::infrastructure::database::connection::DbPool;
use rusqlite::{params, Connection, TransactionBehavior};
use std::collections::HashSet;

pub struct SaleService {
    pool: DbPool,
}

impl SaleService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn get_by_id(&self, id: i64) -> AppResult<Option<SalesInvoice>> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, issue_code, electronic_invoice_number, invoice_date, buyer_type,
                    buyer_name, subtotal, grand_total, total_cost, estimated_profit,
                    status, notes, created_at, confirmed_at, cancelled_at, cancellation_reason
             FROM sales_invoices WHERE id = ?1",
        )?;

        let invoice = stmt.query_row(params![id], |row| {
            Ok(SalesInvoice {
                id: row.get(0)?,
                issue_code: row.get(1)?,
                electronic_invoice_number: row.get(2)?,
                invoice_date: row.get(3)?,
                buyer_type: row.get(4)?,
                buyer_name: row.get(5)?,
                subtotal: row.get(6)?,
                grand_total: row.get(7)?,
                total_cost: row.get(8)?,
                estimated_profit: row.get(9)?,
                status: row.get(10)?,
                notes: row.get(11)?,
                created_at: row.get(12)?,
                confirmed_at: row.get(13)?,
                cancelled_at: row.get(14)?,
                cancellation_reason: row.get(15)?,
                items: Vec::new(),
            })
        });

        match invoice {
            Ok(mut inv) => {
                let mut item_stmt = conn.prepare(
                    "SELECT i.id, i.sales_invoice_id, i.product_id, pr.product_code, pr.product_name,
                            pr.inventory_unit, i.quantity, i.unit_sale_price, i.unit_cost_at_sale,
                            i.line_revenue, i.line_cost, i.estimated_profit
                     FROM sales_invoice_items i
                     JOIN products pr ON pr.id = i.product_id
                     WHERE i.sales_invoice_id = ?1",
                )?;

                let items_iter = item_stmt.query_map(params![id], |row| {
                    Ok(SalesInvoiceItem {
                        id: row.get(0)?,
                        sales_invoice_id: row.get(1)?,
                        product_id: row.get(2)?,
                        product_code: row.get(3)?,
                        product_name: row.get(4)?,
                        inventory_unit: row.get(5)?,
                        quantity: row.get(6)?,
                        unit_sale_price: row.get(7)?,
                        unit_cost_at_sale: row.get(8)?,
                        line_revenue: row.get(9)?,
                        line_cost: row.get(10)?,
                        estimated_profit: row.get(11)?,
                    })
                })?;

                for item in items_iter {
                    inv.items.push(item?);
                }

                Ok(Some(inv))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e.to_string())),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn list(
        &self,
        page: usize,
        page_size: usize,
        search: Option<String>,
        buyer_type: Option<String>,
        status: Option<String>,
        date_from: Option<String>,
        date_to: Option<String>,
    ) -> AppResult<(Vec<SalesInvoice>, usize)> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut where_clauses = vec!["1=1".to_string()];
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(s) = search {
            if !s.trim().is_empty() {
                where_clauses.push(
                    "(issue_code LIKE ? OR electronic_invoice_number LIKE ? OR buyer_name LIKE ?)"
                        .to_string(),
                );
                let pattern = format!("%{}%", s.trim());
                params.push(Box::new(pattern.clone()));
                params.push(Box::new(pattern.clone()));
                params.push(Box::new(pattern));
            }
        }

        if let Some(bt) = buyer_type {
            if !bt.trim().is_empty() {
                where_clauses.push("buyer_type = ?".to_string());
                params.push(Box::new(bt));
            }
        }

        if let Some(st) = status {
            if !st.trim().is_empty() {
                where_clauses.push("status = ?".to_string());
                params.push(Box::new(st));
            }
        }

        if let Some(df) = date_from {
            if !df.trim().is_empty() {
                where_clauses.push("invoice_date >= ?".to_string());
                params.push(Box::new(df));
            }
        }

        if let Some(dt) = date_to {
            if !dt.trim().is_empty() {
                where_clauses.push("invoice_date <= ?".to_string());
                params.push(Box::new(dt));
            }
        }

        let where_str = where_clauses.join(" AND ");

        let count_sql = format!("SELECT COUNT(*) FROM sales_invoices WHERE {}", where_str);
        let mut count_stmt = conn.prepare(&count_sql)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let total: usize = count_stmt.query_row(param_refs.as_slice(), |r| r.get(0))?;

        let offset = (page.max(1) - 1) * page_size;
        let query_sql = format!(
            "SELECT id, issue_code, electronic_invoice_number, invoice_date, buyer_type, \
                    buyer_name, subtotal, grand_total, total_cost, estimated_profit, \
                    status, notes, created_at, confirmed_at, cancelled_at, cancellation_reason \
             FROM sales_invoices WHERE {} \
             ORDER BY id DESC LIMIT {} OFFSET {}",
            where_str, page_size, offset
        );

        let mut stmt = conn.prepare(&query_sql)?;
        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Ok(SalesInvoice {
                id: row.get(0)?,
                issue_code: row.get(1)?,
                electronic_invoice_number: row.get(2)?,
                invoice_date: row.get(3)?,
                buyer_type: row.get(4)?,
                buyer_name: row.get(5)?,
                subtotal: row.get(6)?,
                grand_total: row.get(7)?,
                total_cost: row.get(8)?,
                estimated_profit: row.get(9)?,
                status: row.get(10)?,
                notes: row.get(11)?,
                created_at: row.get(12)?,
                confirmed_at: row.get(13)?,
                cancelled_at: row.get(14)?,
                cancellation_reason: row.get(15)?,
                items: Vec::new(),
            })
        })?;

        let mut items = Vec::new();
        for r in rows {
            items.push(r?);
        }

        Ok((items, total))
    }

    pub fn create_draft(&self, input: CreateSalesInvoiceInput) -> AppResult<SalesInvoice> {
        validate_sale_input(&input)?;
        let mut conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        validate_sale_references(&tx, &input)?;

        let sequence: i64 = match tx.query_row(
            "UPDATE document_sequences
             SET next_value = next_value + 1
             WHERE document_type = 'sale'
             RETURNING next_value - 1",
            [],
            |row| row.get(0),
        ) {
            Ok(seq) => seq,
            Err(_) => {
                tx.execute(
                    "INSERT OR IGNORE INTO document_sequences (document_type, next_value) VALUES ('sale', 1)",
                    [],
                )?;
                tx.query_row(
                    "UPDATE document_sequences
                     SET next_value = next_value + 1
                     WHERE document_type = 'sale'
                     RETURNING next_value - 1",
                    [],
                    |row| row.get(0),
                )?
            }
        };
        let issue_code = format!("PX{sequence:06}");

        let subtotal: i64 = input.items.iter().map(|i| i.line_total_sale).sum();
        let grand_total = subtotal;

        tx.execute(
            "INSERT INTO sales_invoices (
                issue_code, electronic_invoice_number, invoice_date, buyer_type,
                buyer_name, subtotal, grand_total, total_cost, estimated_profit,
                status, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, 'nhap', ?8)",
            params![
                issue_code,
                input.electronic_invoice_number,
                input.invoice_date,
                input.buyer_type,
                input.buyer_name,
                subtotal,
                grand_total,
                input.notes
            ],
        )?;

        let invoice_id = tx.last_insert_rowid();

        for item in &input.items {
            let line_revenue = item.line_total_sale;
            let unit_sale_price = line_revenue / item.quantity;

            tx.execute(
                "INSERT INTO sales_invoice_items (
                    sales_invoice_id, product_id, quantity, unit_sale_price,
                    unit_cost_at_sale, line_revenue, line_cost, estimated_profit
                ) VALUES (?1, ?2, ?3, ?4, 0, ?5, 0, 0)",
                params![
                    invoice_id,
                    item.product_id,
                    item.quantity,
                    unit_sale_price,
                    line_revenue
                ],
            )?;
        }

        tx.commit()?;
        self.get_by_id(invoice_id)?
            .ok_or_else(|| AppError::Internal("Created sales invoice not found".to_string()))
    }

    pub fn update_draft(&self, id: i64, input: CreateSalesInvoiceInput) -> AppResult<SalesInvoice> {
        validate_sale_input(&input)?;
        let mut conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let status: String = tx
            .query_row("SELECT status FROM sales_invoices WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .map_err(|_| AppError::NotFound("Không tìm thấy phiếu xuất.".to_string()))?;
        if status != "nhap" {
            return Err(AppError::InvalidInvoiceState(
                "Chỉ phiếu xuất nháp mới được sửa.".to_string(),
            ));
        }
        validate_sale_references(&tx, &input)?;
        let subtotal: i64 = input.items.iter().map(|i| i.line_total_sale).sum();
        tx.execute("UPDATE sales_invoices SET electronic_invoice_number=?1,invoice_date=?2,buyer_type=?3,buyer_name=?4,subtotal=?5,grand_total=?5,notes=?6 WHERE id=?7", params![input.electronic_invoice_number,input.invoice_date,input.buyer_type,input.buyer_name,subtotal,input.notes,id])?;
        tx.execute(
            "DELETE FROM sales_invoice_items WHERE sales_invoice_id=?1",
            [id],
        )?;
        for item in &input.items {
            let revenue = item.line_total_sale;
            let unit_sale_price = revenue / item.quantity;
            tx.execute("INSERT INTO sales_invoice_items(sales_invoice_id,product_id,quantity,unit_sale_price,unit_cost_at_sale,line_revenue,line_cost,estimated_profit) VALUES(?1,?2,?3,?4,0,?5,0,0)", params![id,item.product_id,item.quantity,unit_sale_price,revenue])?;
        }
        tx.commit()?;
        self.get_by_id(id)?
            .ok_or_else(|| AppError::Internal("Không tải lại được phiếu xuất.".to_string()))
    }

    pub fn delete_draft(&self, id: i64) -> AppResult<bool> {
        let mut conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let status: String = tx
            .query_row("SELECT status FROM sales_invoices WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .map_err(|_| AppError::NotFound("Không tìm thấy phiếu xuất.".to_string()))?;
        if status != "nhap" {
            return Err(AppError::InvalidInvoiceState(
                "Chỉ phiếu xuất nháp mới được xóa.".to_string(),
            ));
        }
        tx.execute(
            "DELETE FROM sales_invoice_items WHERE sales_invoice_id=?1",
            [id],
        )?;
        tx.execute("DELETE FROM sales_invoices WHERE id=?1", [id])?;
        tx.commit()?;
        Ok(true)
    }

    pub fn confirm(&self, id: i64) -> AppResult<SalesInvoice> {
        let mut conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let (status, invoice_date): (String, String) = tx.query_row(
            "SELECT status, invoice_date FROM sales_invoices WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        if status != "nhap" {
            return Err(AppError::InvalidInvoiceState(format!(
                "Phiếu xuất {} đã ở trạng thái '{}'",
                id, status
            )));
        }

        struct DraftItem {
            item_id: i64,
            product_id: i64,
            quantity: i64,
            line_revenue: i64,
        }

        let mut draft_items = Vec::new();
        {
            let mut stmt = tx.prepare("SELECT id, product_id, quantity, line_revenue FROM sales_invoice_items WHERE sales_invoice_id = ?1")?;
            let rows = stmt.query_map(params![id], |r| {
                Ok(DraftItem {
                    item_id: r.get(0)?,
                    product_id: r.get(1)?,
                    quantity: r.get(2)?,
                    line_revenue: r.get(3)?,
                })
            })?;
            for r in rows {
                draft_items.push(r?);
            }
        }

        let mut total_cost: i64 = 0;
        let mut total_profit: i64 = 0;

        for item in draft_items {
            let (product_name, current_stock, average_cost, inventory_value): (String, i64, i64, i64) = tx.query_row(
                "SELECT product_name, current_stock, average_cost,current_inventory_value FROM products WHERE id = ?1",
                params![item.product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?,r.get(3)?)),
            )?;

            if current_stock < item.quantity {
                return Err(AppError::InsufficientStock(format!(
                    "Sản phẩm '{}' chỉ còn {} bao trong kho, không thể xuất {} bao",
                    product_name, current_stock, item.quantity
                )));
            }

            let line_cost = if item.quantity == current_stock {
                inventory_value
            } else {
                ((inventory_value as i128 * item.quantity as i128) / current_stock as i128) as i64
            };
            let unit_cost_at_sale = if item.quantity > 0 {
                line_cost / item.quantity
            } else {
                0
            };
            let line_revenue = item.line_revenue;
            let line_profit = line_revenue - line_cost;

            total_cost += line_cost;
            total_profit += line_profit;

            let new_stock = current_stock - item.quantity;
            let new_inventory_value = inventory_value - line_cost;
            let new_average_cost = if new_stock != 0 {
                (new_inventory_value as f64 / new_stock as f64)
                    .abs()
                    .round() as i64
            } else {
                0
            };
            validate_inventory_state(new_stock, new_inventory_value, new_average_cost, false)?;

            tx.execute(
                "UPDATE sales_invoice_items SET
                    unit_cost_at_sale = ?1,
                    line_revenue = ?2,
                    line_cost = ?3,
                    estimated_profit = ?4
                 WHERE id = ?5",
                params![
                    unit_cost_at_sale,
                    line_revenue,
                    line_cost,
                    line_profit,
                    item.item_id
                ],
            )?;

            tx.execute(
                "UPDATE products SET
                    current_stock = ?1,
                    current_inventory_value=?2,
                    average_cost=?3,
                    updated_at = datetime('now', 'localtime')
                 WHERE id = ?4",
                params![
                    new_stock,
                    new_inventory_value,
                    new_average_cost,
                    item.product_id
                ],
            )?;

            tx.execute(
                "INSERT INTO inventory_transactions (
                    transaction_date, product_id, transaction_type, source_type, source_id,
                    quantity_in, quantity_out, unit_cost, stock_before, stock_after,
                    old_average_cost, new_average_cost,value_in,value_out,
                    inventory_value_before,inventory_value_after
                ) VALUES (?1, ?2, 'xuat', 'sales_invoice', ?3, 0, ?4, ?5, ?6, ?7, ?8, ?9,0,?10,?11,?12)",
                params![
                    invoice_date,
                    item.product_id,
                    id,
                    item.quantity,
                    unit_cost_at_sale,
                    current_stock,
                    new_stock,
                    average_cost,
                    new_average_cost,
                    line_cost,
                    inventory_value,
                    new_inventory_value
                ],
            )?;
        }

        tx.execute(
            "UPDATE sales_invoices SET
                status = 'xac_nhan',
                total_cost = ?1,
                estimated_profit = ?2,
                confirmed_at = datetime('now', 'localtime')
             WHERE id = ?3",
            params![total_cost, total_profit, id],
        )?;

        tx.commit()?;
        self.get_by_id(id)?
            .ok_or_else(|| AppError::Internal("Confirmed sales invoice not found".to_string()))
    }

    pub fn cancel(&self, id: i64, reason: String) -> AppResult<SalesInvoice> {
        if reason.trim().is_empty() {
            return Err(AppError::Validation(
                "Lý do hủy không được để trống.".to_string(),
            ));
        }
        let mut conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let (status, _invoice_date): (String, String) = tx.query_row(
            "SELECT status, invoice_date FROM sales_invoices WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        if status == "huy" {
            return Err(AppError::Conflict(
                "Phiếu xuất đã được hủy trước đó.".to_string(),
            ));
        }
        if status != "xac_nhan" {
            return Err(AppError::InvalidInvoiceState(
                "Chỉ có thể hủy phiếu xuất đã xác nhận.".to_string(),
            ));
        }

        struct SaleItemDetail {
            product_id: i64,
            quantity: i64,
            line_cost: i64,
            unit_cost_at_sale: i64,
        }

        let mut items = Vec::new();
        {
            let mut stmt = tx.prepare("SELECT product_id, quantity, line_cost, unit_cost_at_sale FROM sales_invoice_items WHERE sales_invoice_id = ?1")?;
            let rows = stmt.query_map(params![id], |r| {
                Ok(SaleItemDetail {
                    product_id: r.get(0)?,
                    quantity: r.get(1)?,
                    line_cost: r.get(2)?,
                    unit_cost_at_sale: r.get(3)?,
                })
            })?;
            for row in rows {
                items.push(row?);
            }
        }

        let cancel_date = chrono::Local::now().format("%Y-%m-%d").to_string();

        for item in items {
            let (old_stock, old_avg_cost, old_inventory_value): (i64, i64, i64) = tx.query_row(
                "SELECT current_stock, average_cost, current_inventory_value FROM products WHERE id = ?1",
                params![item.product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )?;

            let new_stock = old_stock + item.quantity;
            let value_in = item.line_cost;
            let new_inventory_value = old_inventory_value + value_in;
            let new_avg_cost = if new_stock != 0 {
                (new_inventory_value as f64 / new_stock as f64)
                    .abs()
                    .round() as i64
            } else {
                0
            };
            validate_inventory_state(
                new_stock,
                new_inventory_value,
                new_avg_cost,
                old_stock < 0 && new_stock < 0,
            )?;

            tx.execute(
                "UPDATE products SET
                    current_stock = ?1,
                    average_cost = ?2,
                    current_inventory_value = ?3,
                    updated_at = datetime('now', 'localtime')
                 WHERE id = ?4",
                params![
                    new_stock,
                    new_avg_cost,
                    new_inventory_value,
                    item.product_id
                ],
            )?;

            tx.execute(
                "INSERT INTO inventory_transactions (
                    transaction_date, product_id, transaction_type, source_type, source_id,
                    quantity_in, quantity_out, unit_cost, stock_before, stock_after,
                    old_average_cost, new_average_cost, value_in, value_out,
                    inventory_value_before, inventory_value_after
                ) VALUES (?1, ?2, 'sale_cancel', 'sales_invoice', ?3, ?4, 0, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?12)",
                params![
                    cancel_date,
                    item.product_id,
                    id,
                    item.quantity,
                    item.unit_cost_at_sale,
                    old_stock,
                    new_stock,
                    old_avg_cost,
                    new_avg_cost,
                    value_in,
                    old_inventory_value,
                    new_inventory_value
                ],
            )?;
        }

        tx.execute(
            "UPDATE sales_invoices SET
                status = 'huy',
                cancelled_at = datetime('now', 'localtime'),
                cancellation_reason = ?1
             WHERE id = ?2",
            params![reason, id],
        )?;

        tx.commit()?;
        self.get_by_id(id)?
            .ok_or_else(|| AppError::Internal("Cancelled sales invoice not found".to_string()))
    }
}

fn validate_sale_input(input: &CreateSalesInvoiceInput) -> AppResult<()> {
    iso_date(&input.invoice_date, "Ngày xuất")?;
    one_of(
        &input.buyer_type,
        &["khach_le", "dai_ly", "trang_trai", "khac"],
        "Loại người mua",
    )?;
    if input.items.is_empty() {
        return Err(AppError::Validation(
            "Phiếu xuất phải có ít nhất một sản phẩm.".to_string(),
        ));
    }
    for item in &input.items {
        positive(item.product_id, "Sản phẩm")?;
        positive(item.quantity, "Số lượng xuất")?;
        positive(item.line_total_sale, "Tổng giá trị xuất/bán")?;
    }
    Ok(())
}

fn validate_sale_references(conn: &Connection, input: &CreateSalesInvoiceInput) -> AppResult<()> {
    let mut ids = HashSet::new();
    for item in &input.items {
        if !ids.insert(item.product_id) {
            return Err(AppError::Validation(
                "Một sản phẩm không được xuất hiện hai lần trong phiếu.".to_string(),
            ));
        }
        let active: Option<i64> = conn
            .query_row(
                "SELECT active FROM products WHERE id=?1",
                [item.product_id],
                |r| r.get(0),
            )
            .ok();
        match active {
            None => return Err(AppError::NotFound("Không tìm thấy sản phẩm.".to_string())),
            Some(0) => {
                return Err(AppError::Validation(
                    "Sản phẩm đã ngừng hoạt động.".to_string(),
                ))
            }
            _ => {}
        }
    }
    Ok(())
}
