use crate::domain::errors::{AppError, AppResult};
use crate::domain::inventory_invariant::validate_inventory_state;
use crate::domain::models::{CreateSalesInvoiceInput, SalesInvoice, SalesInvoiceItem};
use crate::domain::validation::{iso_date, one_of, positive};
use crate::infrastructure::database::connection::DbPool;
use rusqlite::{params, Connection, Transaction, TransactionBehavior};
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

        tx.execute(
            "UPDATE sales_invoices SET status = 'xac_nhan', confirmed_at = datetime('now', 'localtime') WHERE id = ?1",
            params![id],
        )?;

        tx.execute(
            "UPDATE sales_invoices SET status = 'xac_nhan', confirmed_at = datetime('now', 'localtime') WHERE id = ?1",
            params![id],
        )?;

        let product_ids: Vec<i64> = {
            let mut stmt = tx.prepare(
                "SELECT DISTINCT product_id FROM sales_invoice_items WHERE sales_invoice_id = ?1",
            )?;
            let res = stmt
                .query_map(params![id], |r| r.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            res
        };

        for pid in product_ids {
            rebuild_product_fifo_allocations(&tx, pid)?;
        }

        let items_list: Vec<(i64, i64, i64, i64)> = {
            let mut item_stmt = tx.prepare("SELECT product_id, quantity, unit_cost_at_sale, line_cost FROM sales_invoice_items WHERE sales_invoice_id = ?1")?;
            let res = item_stmt
                .query_map(params![id], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            res
        };

        for (product_id, quantity, unit_cost_at_sale, line_cost) in items_list {
            let (current_stock, average_cost, inventory_value): (i64, i64, i64) = tx.query_row(
                "SELECT current_stock, average_cost, current_inventory_value FROM products WHERE id = ?1",
                params![product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )?;

            tx.execute(
                "INSERT INTO inventory_transactions (
                    transaction_date, product_id, transaction_type, source_type, source_id,
                    quantity_in, quantity_out, unit_cost, stock_before, stock_after,
                    old_average_cost, new_average_cost, value_in, value_out,
                    inventory_value_before, inventory_value_after
                ) VALUES (?1, ?2, 'xuat', 'sales_invoice', ?3, 0, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11, ?12)",
                params![
                    invoice_date,
                    product_id,
                    id,
                    quantity,
                    unit_cost_at_sale,
                    current_stock + quantity,
                    current_stock,
                    average_cost,
                    average_cost,
                    line_cost,
                    inventory_value + line_cost,
                    inventory_value
                ],
            )?;
        }

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

        let cancel_date = chrono::Local::now().format("%Y-%m-%d").to_string();

        let product_ids: Vec<i64> = {
            let mut stmt = tx.prepare(
                "SELECT DISTINCT product_id FROM sales_invoice_items WHERE sales_invoice_id = ?1",
            )?;
            let res = stmt
                .query_map(params![id], |r| r.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            res
        };

        tx.execute(
            "UPDATE sales_invoices SET
                status = 'huy',
                cancelled_at = datetime('now', 'localtime'),
                cancellation_reason = ?1
             WHERE id = ?2",
            params![reason, id],
        )?;

        for pid in product_ids {
            rebuild_product_fifo_allocations(&tx, pid)?;
        }

        let items_list: Vec<(i64, i64, i64, i64)> = {
            let mut item_stmt = tx.prepare("SELECT product_id, quantity, unit_cost_at_sale, line_cost FROM sales_invoice_items WHERE sales_invoice_id = ?1")?;
            let res = item_stmt
                .query_map(params![id], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            res
        };

        for (product_id, quantity, unit_cost_at_sale, line_cost) in items_list {
            let (current_stock, average_cost, inventory_value): (i64, i64, i64) = tx.query_row(
                "SELECT current_stock, average_cost, current_inventory_value FROM products WHERE id = ?1",
                params![product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
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
                    product_id,
                    id,
                    quantity,
                    unit_cost_at_sale,
                    current_stock - quantity,
                    current_stock,
                    average_cost,
                    average_cost,
                    line_cost,
                    inventory_value - line_cost,
                    inventory_value
                ],
            )?;
        }

        tx.commit()?;
        self.get_by_id(id)?
            .ok_or_else(|| AppError::Internal("Cancelled sales invoice not found".to_string()))
    }

    pub fn preview_fifo_allocation(
        &self,
        product_id: i64,
        quantity: i64,
        sale_date: String,
    ) -> AppResult<crate::domain::models::FifoAllocationPreviewDTO> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        struct LotRow {
            purchase_invoice_id: i64,
            purchase_invoice_item_id: i64,
            invoice_number: String,
            invoice_date: String,
            total_quantity: i64,
            allocated_quantity: i64,
            effective_unit_cost: i64,
        }

        let mut stmt = conn.prepare(
            "SELECT pi.id, pii.id, pi.invoice_number, pi.invoice_date, pii.quantity,
                    COALESCE((SELECT SUM(a.quantity) FROM inventory_allocations a WHERE a.purchase_invoice_item_id = pii.id), 0) as allocated,
                    pii.effective_unit_cost
             FROM purchase_invoice_items pii
             JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id
             WHERE pii.product_id = ?1 AND pi.status = 'xac_nhan' AND pi.invoice_date <= ?2
             ORDER BY pi.invoice_date ASC, pi.created_at ASC, pi.id ASC, pii.id ASC"
        )?;

        let lots_iter = stmt.query_map(params![product_id, sale_date], |r| {
            Ok(LotRow {
                purchase_invoice_id: r.get(0)?,
                purchase_invoice_item_id: r.get(1)?,
                invoice_number: r.get(2)?,
                invoice_date: r.get(3)?,
                total_quantity: r.get(4)?,
                allocated_quantity: r.get(5)?,
                effective_unit_cost: r.get(6)?,
            })
        })?;

        let mut lots_breakdown = Vec::new();
        let mut remaining_needed = quantity;
        let mut total_fifo_cost: i64 = 0;
        let mut total_available_stock: i64 = 0;

        for lot in lots_iter {
            let lot = lot?;
            let available = lot.total_quantity - lot.allocated_quantity;
            if available > 0 {
                total_available_stock += available;
                if remaining_needed > 0 {
                    let take = std::cmp::min(available, remaining_needed);
                    remaining_needed -= take;
                    let line_cost = take * lot.effective_unit_cost;
                    total_fifo_cost += line_cost;
                    lots_breakdown.push(crate::domain::models::FifoLotBreakdownItemDTO {
                        purchase_invoice_id: lot.purchase_invoice_id,
                        purchase_invoice_item_id: lot.purchase_invoice_item_id,
                        invoice_number: lot.invoice_number,
                        invoice_date: lot.invoice_date,
                        quantity_allocated: take,
                        unit_cost: lot.effective_unit_cost,
                        line_cost,
                    });
                }
            }
        }

        let is_sufficient = remaining_needed == 0;
        let weighted_unit_cost = if quantity > 0 && is_sufficient {
            total_fifo_cost / quantity
        } else {
            0
        };

        Ok(crate::domain::models::FifoAllocationPreviewDTO {
            product_id,
            requested_quantity: quantity,
            total_available_stock,
            is_sufficient,
            total_fifo_cost,
            weighted_unit_cost,
            lots: lots_breakdown,
        })
    }
}

pub fn rebuild_product_fifo_allocations(tx: &Transaction, product_id: i64) -> AppResult<()> {
    tx.execute(
        "DELETE FROM inventory_allocations WHERE product_id = ?1",
        params![product_id],
    )?;

    struct LotInfo {
        purchase_invoice_id: i64,
        purchase_invoice_item_id: i64,
        invoice_date: String,
        initial_quantity: i64,
        remaining_quantity: i64,
        effective_unit_cost: i64,
    }

    let mut stmt_lots = tx.prepare(
        "SELECT pi.id, pii.id, pi.invoice_date, pii.quantity, pii.effective_unit_cost
         FROM purchase_invoice_items pii
         JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id
         WHERE pii.product_id = ?1 AND pi.status = 'xac_nhan'
         ORDER BY pi.invoice_date ASC, pi.created_at ASC, pi.id ASC, pii.id ASC",
    )?;

    let mut lots: Vec<LotInfo> = stmt_lots
        .query_map(params![product_id], |row: &rusqlite::Row| {
            let qty: i64 = row.get(3)?;
            Ok(LotInfo {
                purchase_invoice_id: row.get(0)?,
                purchase_invoice_item_id: row.get(1)?,
                invoice_date: row.get(2)?,
                initial_quantity: qty,
                remaining_quantity: qty,
                effective_unit_cost: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    struct SaleItemInfo {
        sales_invoice_id: i64,
        sales_invoice_item_id: i64,
        invoice_date: String,
        quantity: i64,
        line_revenue: i64,
    }

    let mut stmt_sales = tx.prepare(
        "SELECT si.id, sii.id, si.invoice_date, sii.quantity, sii.line_revenue
         FROM sales_invoice_items sii
         JOIN sales_invoices si ON si.id = sii.sales_invoice_id
         WHERE sii.product_id = ?1 AND si.status = 'xac_nhan'
         ORDER BY si.invoice_date ASC, si.created_at ASC, si.id ASC, sii.id ASC",
    )?;

    let sales_items: Vec<SaleItemInfo> = stmt_sales
        .query_map(params![product_id], |row: &rusqlite::Row| {
            Ok(SaleItemInfo {
                sales_invoice_id: row.get(0)?,
                sales_invoice_item_id: row.get(1)?,
                invoice_date: row.get(2)?,
                quantity: row.get(3)?,
                line_revenue: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let product_name: String = tx
        .query_row(
            "SELECT product_name FROM products WHERE id = ?1",
            params![product_id],
            |row: &rusqlite::Row| row.get(0),
        )
        .unwrap_or_else(|_| format!("ID {}", product_id));

    let mut modified_sales_invoices: HashSet<i64> = HashSet::new();

    for sale in sales_items {
        let mut remaining_to_allocate = sale.quantity;
        let mut total_item_cost: i64 = 0;

        for lot in lots.iter_mut() {
            if remaining_to_allocate <= 0 {
                break;
            }

            if lot.invoice_date > sale.invoice_date {
                continue;
            }

            if lot.remaining_quantity <= 0 {
                continue;
            }

            let take = std::cmp::min(lot.remaining_quantity, remaining_to_allocate);
            lot.remaining_quantity -= take;
            remaining_to_allocate -= take;

            let line_cost = take * lot.effective_unit_cost;
            total_item_cost += line_cost;

            tx.execute(
                "INSERT INTO inventory_allocations (
                    sales_invoice_id, sales_invoice_item_id, purchase_invoice_id,
                    purchase_invoice_item_id, product_id, quantity, unit_cost
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    sale.sales_invoice_id,
                    sale.sales_invoice_item_id,
                    lot.purchase_invoice_id,
                    lot.purchase_invoice_item_id,
                    product_id,
                    take,
                    lot.effective_unit_cost
                ],
            )?;
        }

        if remaining_to_allocate > 0 {
            let total_available_on_date: i64 = lots
                .iter()
                .filter(|l| l.invoice_date <= sale.invoice_date)
                .map(|l| l.remaining_quantity + (l.initial_quantity - l.remaining_quantity))
                .sum();
            return Err(AppError::InsufficientStock(format!(
                "Tồn kho khả dụng đến ngày {} của sản phẩm '{}' chỉ còn {} bao. Không thể xuất {} bao.",
                sale.invoice_date, product_name, total_available_on_date, sale.quantity
            )));
        }

        let unit_cost_at_sale = if sale.quantity > 0 {
            total_item_cost / sale.quantity
        } else {
            0
        };
        let line_profit = sale.line_revenue - total_item_cost;

        tx.execute(
            "UPDATE sales_invoice_items SET
                unit_cost_at_sale = ?1,
                line_cost = ?2,
                estimated_profit = ?3
             WHERE id = ?4",
            params![
                unit_cost_at_sale,
                total_item_cost,
                line_profit,
                sale.sales_invoice_item_id
            ],
        )?;

        modified_sales_invoices.insert(sale.sales_invoice_id);
    }

    for invoice_id in modified_sales_invoices {
        let (total_cost, total_profit): (i64, i64) = tx.query_row(
            "SELECT COALESCE(SUM(line_cost), 0), COALESCE(SUM(estimated_profit), 0)
             FROM sales_invoice_items WHERE sales_invoice_id = ?1",
            params![invoice_id],
            |row: &rusqlite::Row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        tx.execute(
            "UPDATE sales_invoices SET
                total_cost = ?1,
                estimated_profit = ?2
             WHERE id = ?3",
            params![total_cost, total_profit, invoice_id],
        )?;
    }

    let total_purchased_qty: i64 = lots.iter().map(|l| l.initial_quantity).sum();
    let total_purchased_val: i64 = lots
        .iter()
        .map(|l| l.initial_quantity * l.effective_unit_cost)
        .sum();
    let total_sold_qty: i64 = lots
        .iter()
        .map(|l| l.initial_quantity - l.remaining_quantity)
        .sum();
    let total_sold_cost: i64 = lots
        .iter()
        .map(|l| (l.initial_quantity - l.remaining_quantity) * l.effective_unit_cost)
        .sum();

    let current_stock = total_purchased_qty - total_sold_qty;
    let current_inventory_value = total_purchased_val - total_sold_cost;
    let average_cost = if current_stock > 0 {
        (current_inventory_value as f64 / current_stock as f64).round() as i64
    } else {
        0
    };

    validate_inventory_state(current_stock, current_inventory_value, average_cost, false)?;

    tx.execute(
        "UPDATE products SET
            current_stock = ?1,
            current_inventory_value = ?2,
            average_cost = ?3,
            updated_at = datetime('now', 'localtime')
         WHERE id = ?4",
        params![
            current_stock,
            current_inventory_value,
            average_cost,
            product_id
        ],
    )?;

    Ok(())
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
