use crate::domain::errors::{AppError, AppResult};
use crate::domain::inventory_invariant::validate_inventory_state;
use crate::domain::models::{CreatePurchaseInvoiceInput, PurchaseInvoice, PurchaseInvoiceItem};
use crate::domain::validation::{iso_date, positive, required};
use crate::infrastructure::database::connection::DbPool;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use std::collections::HashSet;

pub struct PurchaseService {
    pool: DbPool,
}

impl PurchaseService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn get_by_id(&self, id: i64) -> AppResult<Option<PurchaseInvoice>> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT p.id, p.receipt_code, p.invoice_number, p.invoice_date, p.received_date,
                    p.supplier_id, s.company_name, p.subtotal, p.discount_amount, p.tax_amount,
                    p.shipping_cost, p.shipping_allocation_method, p.grand_total, p.paid_amount,
                    p.remaining_amount, p.payment_status, p.payment_method, p.status, p.notes,
                    p.created_at, p.confirmed_at, p.cancelled_at, p.cancellation_reason
             FROM purchase_invoices p
             JOIN suppliers s ON s.id = p.supplier_id
             WHERE p.id = ?1",
        )?;

        let invoice = stmt.query_row(params![id], |row| {
            Ok(PurchaseInvoice {
                id: row.get(0)?,
                receipt_code: row.get(1)?,
                invoice_number: row.get(2)?,
                invoice_date: row.get(3)?,
                received_date: row.get(4)?,
                supplier_id: row.get(5)?,
                supplier_name: row.get(6)?,
                subtotal: row.get(7)?,
                discount_amount: row.get(8)?,
                tax_amount: row.get(9)?,
                shipping_cost: row.get(10)?,
                shipping_allocation_method: row.get(11)?,
                grand_total: row.get(12)?,
                paid_amount: row.get(13)?,
                remaining_amount: row.get(14)?,
                payment_status: row.get(15)?,
                payment_method: row.get(16)?,
                status: row.get(17)?,
                notes: row.get(18)?,
                created_at: row.get(19)?,
                confirmed_at: row.get(20)?,
                cancelled_at: row.get(21)?,
                cancellation_reason: row.get(22)?,
                items: Vec::new(),
            })
        });

        match invoice {
            Ok(mut inv) => {
                let mut item_stmt = conn.prepare(
                    "SELECT i.id, i.purchase_invoice_id, i.product_id, pr.product_code, pr.product_name,
                            pr.inventory_unit, i.quantity, i.invoice_unit_price, i.discount_amount,
                            i.shipping_allocation, i.effective_unit_cost, i.inventory_cost_value, i.line_total, i.notes
                     FROM purchase_invoice_items i
                     JOIN products pr ON pr.id = i.product_id
                     WHERE i.purchase_invoice_id = ?1",
                )?;

                let items_iter = item_stmt.query_map(params![id], |row| {
                    Ok(PurchaseInvoiceItem {
                        id: row.get(0)?,
                        purchase_invoice_id: row.get(1)?,
                        product_id: row.get(2)?,
                        product_code: row.get(3)?,
                        product_name: row.get(4)?,
                        inventory_unit: row.get(5)?,
                        quantity: row.get(6)?,
                        invoice_unit_price: row.get(7)?,
                        discount_amount: row.get(8)?,
                        shipping_allocation: row.get(9)?,
                        effective_unit_cost: row.get(10)?,
                        inventory_cost_value: row.get(11)?,
                        line_total: row.get(12)?,
                        notes: row.get(13)?,
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
        supplier_id: Option<i64>,
        status: Option<String>,
        date_from: Option<String>,
        date_to: Option<String>,
    ) -> AppResult<(Vec<PurchaseInvoice>, usize)> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut where_clauses = vec!["1=1".to_string()];
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(s) = search {
            if !s.trim().is_empty() {
                where_clauses.push(
                    "(p.receipt_code LIKE ? OR p.invoice_number LIKE ? OR s.company_name LIKE ?)"
                        .to_string(),
                );
                let pattern = format!("%{}%", s.trim());
                params.push(Box::new(pattern.clone()));
                params.push(Box::new(pattern.clone()));
                params.push(Box::new(pattern));
            }
        }

        if let Some(sid) = supplier_id {
            where_clauses.push("p.supplier_id = ?".to_string());
            params.push(Box::new(sid));
        }

        if let Some(st) = status {
            if !st.trim().is_empty() {
                where_clauses.push("p.status = ?".to_string());
                params.push(Box::new(st));
            }
        }

        if let Some(df) = date_from {
            if !df.trim().is_empty() {
                where_clauses.push("p.invoice_date >= ?".to_string());
                params.push(Box::new(df));
            }
        }

        if let Some(dt) = date_to {
            if !dt.trim().is_empty() {
                where_clauses.push("p.invoice_date <= ?".to_string());
                params.push(Box::new(dt));
            }
        }

        let where_str = where_clauses.join(" AND ");

        let count_sql = format!(
            "SELECT COUNT(*) FROM purchase_invoices p JOIN suppliers s ON s.id = p.supplier_id WHERE {}",
            where_str
        );

        let mut count_stmt = conn.prepare(&count_sql)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let total: usize = count_stmt.query_row(param_refs.as_slice(), |r| r.get(0))?;

        let offset = (page.max(1) - 1) * page_size;
        let query_sql = format!(
            "SELECT p.id, p.receipt_code, p.invoice_number, p.invoice_date, p.received_date, \
                    p.supplier_id, s.company_name, p.subtotal, p.discount_amount, p.tax_amount, \
                    p.shipping_cost, p.shipping_allocation_method, p.grand_total, p.paid_amount, \
                    p.remaining_amount, p.payment_status, p.payment_method, p.status, p.notes, \
                    p.created_at, p.confirmed_at, p.cancelled_at, p.cancellation_reason \
             FROM purchase_invoices p \
             JOIN suppliers s ON s.id = p.supplier_id \
             WHERE {} \
             ORDER BY p.id DESC LIMIT {} OFFSET {}",
            where_str, page_size, offset
        );

        let mut stmt = conn.prepare(&query_sql)?;
        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Ok(PurchaseInvoice {
                id: row.get(0)?,
                receipt_code: row.get(1)?,
                invoice_number: row.get(2)?,
                invoice_date: row.get(3)?,
                received_date: row.get(4)?,
                supplier_id: row.get(5)?,
                supplier_name: row.get(6)?,
                subtotal: row.get(7)?,
                discount_amount: row.get(8)?,
                tax_amount: row.get(9)?,
                shipping_cost: row.get(10)?,
                shipping_allocation_method: row.get(11)?,
                grand_total: row.get(12)?,
                paid_amount: row.get(13)?,
                remaining_amount: row.get(14)?,
                payment_status: row.get(15)?,
                payment_method: row.get(16)?,
                status: row.get(17)?,
                notes: row.get(18)?,
                created_at: row.get(19)?,
                confirmed_at: row.get(20)?,
                cancelled_at: row.get(21)?,
                cancellation_reason: row.get(22)?,
                items: Vec::new(),
            })
        })?;

        let mut items = Vec::new();
        for r in rows {
            items.push(r?);
        }

        Ok((items, total))
    }

    pub fn create_draft(&self, input: CreatePurchaseInvoiceInput) -> AppResult<PurchaseInvoice> {
        validate_purchase_input(&input)?;
        let mut conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        validate_purchase_references(&tx, &input)?;

        let sequence: i64 = match tx.query_row(
            "UPDATE document_sequences
             SET next_value = next_value + 1
             WHERE document_type = 'purchase'
             RETURNING next_value - 1",
            [],
            |row| row.get(0),
        ) {
            Ok(seq) => seq,
            Err(_) => {
                tx.execute(
                    "INSERT OR IGNORE INTO document_sequences (document_type, next_value) VALUES ('purchase', 1)",
                    [],
                )?;
                tx.query_row(
                    "UPDATE document_sequences
                     SET next_value = next_value + 1
                     WHERE document_type = 'purchase'
                     RETURNING next_value - 1",
                    [],
                    |row| row.get(0),
                )?
            }
        };
        let receipt_code = format!("PN{sequence:06}");

        let discount_amount = 0_i64;
        let tax_amount = 0_i64;
        let shipping_cost = 0_i64;
        let shipping_method = "quantity".to_string();
        let payment_method = "chuyen_khoan".to_string();

        let subtotal: i64 = input.items.iter().map(|item| item.line_total).sum();
        let grand_total = subtotal;
        let remaining_amount = grand_total;

        tx.execute(
            "INSERT INTO purchase_invoices (
                receipt_code, invoice_number, invoice_date, received_date, supplier_id,
                subtotal, discount_amount, tax_amount, shipping_cost, shipping_allocation_method,
                grand_total, paid_amount, remaining_amount, payment_status, payment_method,
                status, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, ?12, 'chua_thanh_toan', ?13, 'nhap', ?14)",
            params![
                receipt_code,
                input.invoice_number.trim(),
                input.invoice_date,
                input.received_date,
                input.supplier_id,
                subtotal,
                discount_amount,
                tax_amount,
                shipping_cost,
                shipping_method,
                grand_total,
                remaining_amount,
                payment_method,
                input.notes
            ],
        )?;

        let invoice_id = tx.last_insert_rowid();
        insert_purchase_items(&tx, invoice_id, &input)?;

        tx.commit()?;
        self.get_by_id(invoice_id)?
            .ok_or_else(|| AppError::Internal("Created purchase invoice not found".to_string()))
    }

    pub fn update_draft(
        &self,
        id: i64,
        input: CreatePurchaseInvoiceInput,
    ) -> AppResult<PurchaseInvoice> {
        validate_purchase_input(&input)?;
        let mut conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let status: String = tx
            .query_row(
                "SELECT status FROM purchase_invoices WHERE id=?1",
                [id],
                |row| row.get(0),
            )
            .map_err(|_| AppError::NotFound("Không tìm thấy phiếu nhập.".to_string()))?;
        if status != "nhap" {
            return Err(AppError::InvalidInvoiceState(
                "Chỉ phiếu nhập nháp mới được sửa.".to_string(),
            ));
        }
        validate_purchase_references(&tx, &input)?;
        let subtotal: i64 = input.items.iter().map(|item| item.line_total).sum();
        let grand_total = subtotal;
        tx.execute(
            "UPDATE purchase_invoices SET invoice_number=?1,invoice_date=?2,received_date=?3,supplier_id=?4,subtotal=?5,discount_amount=0,tax_amount=0,grand_total=?6,remaining_amount=?6,payment_method='chuyen_khoan',notes=?7 WHERE id=?8",
            params![
                input.invoice_number.trim(),
                input.invoice_date,
                input.received_date,
                input.supplier_id,
                subtotal,
                grand_total,
                input.notes,
                id
            ],
        )?;
        tx.execute(
            "DELETE FROM purchase_invoice_items WHERE purchase_invoice_id=?1",
            [id],
        )?;
        insert_purchase_items(&tx, id, &input)?;
        tx.commit()?;
        self.get_by_id(id)?
            .ok_or_else(|| AppError::Internal("Không tải lại được phiếu nhập.".to_string()))
    }

    pub fn delete_draft(&self, id: i64) -> AppResult<bool> {
        let mut conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let status: String = tx
            .query_row(
                "SELECT status FROM purchase_invoices WHERE id=?1",
                [id],
                |row| row.get(0),
            )
            .map_err(|_| AppError::NotFound("Không tìm thấy phiếu nhập.".to_string()))?;
        if status != "nhap" {
            return Err(AppError::InvalidInvoiceState(
                "Chỉ phiếu nhập nháp mới được xóa.".to_string(),
            ));
        }
        tx.execute(
            "DELETE FROM purchase_invoice_items WHERE purchase_invoice_id=?1",
            [id],
        )?;
        tx.execute("DELETE FROM purchase_invoices WHERE id=?1", [id])?;
        tx.commit()?;
        Ok(true)
    }

    pub fn confirm(&self, id: i64) -> AppResult<PurchaseInvoice> {
        let mut conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let (status, invoice_date): (String, String) = tx.query_row(
            "SELECT status, invoice_date FROM purchase_invoices WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        if status != "nhap" {
            return Err(AppError::InvalidInvoiceState(format!(
                "Phiếu nhập {} đã ở trạng thái '{}'",
                id, status
            )));
        }

        struct ItemDetail {
            product_id: i64,
            quantity: i64,
            effective_unit_cost: i64,
            inventory_cost_value: i64,
        }

        let mut items = Vec::new();
        {
            let mut stmt = tx.prepare("SELECT product_id, quantity, effective_unit_cost, inventory_cost_value FROM purchase_invoice_items WHERE purchase_invoice_id = ?1")?;
            let rows = stmt.query_map(params![id], |r| {
                Ok(ItemDetail {
                    product_id: r.get(0)?,
                    quantity: r.get(1)?,
                    effective_unit_cost: r.get(2)?,
                    inventory_cost_value: r.get(3)?,
                })
            })?;
            for row in rows {
                items.push(row?);
            }
        }

        for item in &items {
            let (old_stock, old_avg_cost, old_inventory_value): (i64, i64, i64) = tx.query_row(
                "SELECT current_stock, average_cost, current_inventory_value FROM products WHERE id = ?1",
                params![item.product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )?;

            let new_stock = old_stock + item.quantity;
            let value_in = item.inventory_cost_value;
            let new_inventory_value = old_inventory_value + value_in;
            let new_avg_cost = if new_stock != 0 {
                (new_inventory_value as f64 / new_stock as f64)
                    .abs()
                    .round() as i64
            } else {
                item.effective_unit_cost
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
                    latest_purchase_price = ?3,
                    latest_purchase_price_known = 1,
                    current_inventory_value = ?4,
                    updated_at = datetime('now', 'localtime')
                 WHERE id = ?5",
                params![
                    new_stock,
                    new_avg_cost,
                    item.effective_unit_cost,
                    new_inventory_value,
                    item.product_id
                ],
            )?;

            tx.execute(
                "INSERT INTO inventory_transactions (
                    transaction_date, product_id, transaction_type, source_type, source_id,
                    quantity_in, quantity_out, unit_cost, stock_before, stock_after,
                    old_average_cost, new_average_cost,value_in,value_out,
                    inventory_value_before,inventory_value_after
                ) VALUES (?1, ?2, 'nhap', 'purchase_invoice', ?3, ?4, 0, ?5, ?6, ?7, ?8, ?9,?10,0,?11,?12)",
                params![
                    invoice_date,
                    item.product_id,
                    id,
                    item.quantity,
                    item.effective_unit_cost,
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
            "UPDATE purchase_invoices SET status = 'xac_nhan', confirmed_at = datetime('now', 'localtime') WHERE id = ?1",
            params![id],
        )?;

        tx.commit()?;
        self.get_by_id(id)?
            .ok_or_else(|| AppError::Internal("Confirmed purchase invoice not found".to_string()))
    }

    pub fn cancel(&self, id: i64, reason: String) -> AppResult<PurchaseInvoice> {
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

        // 1. Get status and block if not confirmed
        let status: String = tx.query_row(
            "SELECT status FROM purchase_invoices WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;

        if status == "huy" {
            return Err(AppError::Conflict(
                "Phiếu nhập đã được hủy trước đó.".to_string(),
            ));
        }
        if status != "xac_nhan" {
            return Err(AppError::InvalidInvoiceState(
                "Chỉ có thể hủy phiếu nhập đã xác nhận.".to_string(),
            ));
        }

        // 2. Block if active supplier payments exist
        let active_payments_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM supplier_payments WHERE purchase_invoice_id = ?1 AND status = 'active'",
            params![id],
            |row| row.get(0),
        )?;
        if active_payments_count > 0 {
            return Err(AppError::Conflict(
                "Phiếu đã có thanh toán. Hãy hủy các thanh toán trước khi hủy phiếu nhập."
                    .to_string(),
            ));
        }

        struct PurchaseItemDetail {
            product_id: i64,
            quantity: i64,
            effective_unit_cost: i64,
            inventory_cost_value: i64,
        }

        let mut items = Vec::new();
        {
            let mut stmt = tx.prepare(
                "SELECT pi.product_id, pi.quantity, pi.effective_unit_cost, pi.inventory_cost_value
                 FROM purchase_invoice_items pi
                 WHERE pi.purchase_invoice_id = ?1",
            )?;
            let rows = stmt.query_map(params![id], |r| {
                Ok(PurchaseItemDetail {
                    product_id: r.get(0)?,
                    quantity: r.get(1)?,
                    effective_unit_cost: r.get(2)?,
                    inventory_cost_value: r.get(3)?,
                })
            })?;
            for row in rows {
                items.push(row?);
            }
        }

        // 3. Validate every future state before mutating any product or ledger row.
        for item in &items {
            let (current_stock, current_inventory_value): (i64, i64) = tx.query_row(
                "SELECT current_stock, current_inventory_value FROM products WHERE id = ?1",
                params![item.product_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            let new_stock = current_stock - item.quantity;
            let new_inventory_value = current_inventory_value - item.inventory_cost_value;
            if new_stock < 0
                || new_inventory_value < 0
                || (new_stock == 0 && new_inventory_value != 0)
            {
                return Err(AppError::Conflict(
                    "Không thể hủy phiếu nhập này vì tồn kho hoặc giá vốn hiện tại đã thay đổi sau khi phiếu được xác nhận.\n\nHãy sử dụng chức năng Điều chỉnh tồn kho để xử lý chênh lệch."
                        .to_string(),
                ));
            }
        }

        let cancel_date = chrono::Local::now().format("%Y-%m-%d").to_string();

        // 4. Reverse quantities and values
        for item in &items {
            let (old_stock, old_avg_cost, old_inventory_value): (i64, i64, i64) = tx.query_row(
                "SELECT current_stock, average_cost, current_inventory_value FROM products WHERE id = ?1",
                params![item.product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )?;

            let new_stock = old_stock - item.quantity;
            let value_out = item.inventory_cost_value;
            let new_inventory_value = old_inventory_value - value_out;
            let new_avg_cost = if new_stock != 0 {
                (new_inventory_value as f64 / new_stock as f64)
                    .abs()
                    .round() as i64
            } else {
                0
            };
            validate_inventory_state(new_stock, new_inventory_value, new_avg_cost, false)?;

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
                    if new_stock == 0 {
                        0
                    } else {
                        new_inventory_value
                    },
                    item.product_id
                ],
            )?;

            tx.execute(
                "INSERT INTO inventory_transactions (
                    transaction_date, product_id, transaction_type, source_type, source_id,
                    quantity_in, quantity_out, unit_cost, stock_before, stock_after,
                    old_average_cost, new_average_cost, value_in, value_out,
                    inventory_value_before, inventory_value_after
                ) VALUES (?1, ?2, 'purchase_cancel', 'purchase_invoice', ?3, 0, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11, ?12)",
                params![
                    cancel_date,
                    item.product_id,
                    id,
                    item.quantity,
                    item.effective_unit_cost,
                    old_stock,
                    new_stock,
                    old_avg_cost,
                    new_avg_cost,
                    value_out,
                    old_inventory_value,
                    if new_stock == 0 { 0 } else { new_inventory_value }
                ],
            )?;
        }

        // 5. Update status
        tx.execute(
            "UPDATE purchase_invoices SET
                status = 'huy',
                cancelled_at = datetime('now', 'localtime'),
                cancellation_reason = ?1
             WHERE id = ?2",
            params![reason, id],
        )?;

        let affected_products = items
            .iter()
            .map(|item| item.product_id)
            .collect::<HashSet<_>>();
        for product_id in affected_products {
            let latest_price: Option<i64> = tx
                .query_row(
                    "SELECT pii.effective_unit_cost
                     FROM purchase_invoice_items pii
                     JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id
                     WHERE pii.product_id = ?1 AND pi.status = 'xac_nhan'
                     ORDER BY pi.received_date DESC, pi.id DESC, pii.id DESC
                     LIMIT 1",
                    [product_id],
                    |row| row.get(0),
                )
                .optional()?;
            tx.execute(
                "UPDATE products SET latest_purchase_price=?1,latest_purchase_price_known=?2 WHERE id=?3",
                params![latest_price.unwrap_or(0), i64::from(latest_price.is_some()), product_id],
            )?;
        }

        tx.commit()?;
        self.get_by_id(id)?
            .ok_or_else(|| AppError::Internal("Cancelled purchase invoice not found".to_string()))
    }
}

fn validate_purchase_input(input: &CreatePurchaseInvoiceInput) -> AppResult<()> {
    required(&input.invoice_number, "Số hóa đơn")?;
    positive(input.supplier_id, "Nhà cung cấp")?;
    iso_date(&input.invoice_date, "Ngày hóa đơn")?;
    iso_date(&input.received_date, "Ngày nhận hàng")?;
    if input.items.is_empty() {
        return Err(AppError::Validation(
            "Phiếu nhập phải có ít nhất một sản phẩm.".to_string(),
        ));
    }
    let mut seen_ids = HashSet::new();
    for item in &input.items {
        positive(item.product_id, "Sản phẩm")?;
        positive(item.quantity, "Số lượng nhập")?;
        positive(item.line_total, "Tổng giá trị nhập")?;
        if !seen_ids.insert(item.product_id) {
            return Err(AppError::Validation(
                "Phiếu nhập không được chứa sản phẩm trùng lặp.".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_purchase_references(
    conn: &Connection,
    input: &CreatePurchaseInvoiceInput,
) -> AppResult<()> {
    let supplier: Option<i64> = conn
        .query_row(
            "SELECT active FROM suppliers WHERE id=?1",
            [input.supplier_id],
            |r| r.get(0),
        )
        .ok();
    match supplier {
        None => {
            return Err(AppError::NotFound(
                "Không tìm thấy nhà cung cấp.".to_string(),
            ))
        }
        Some(0) => {
            return Err(AppError::Validation(
                "Nhà cung cấp đã ngừng hoạt động.".to_string(),
            ))
        }
        _ => {}
    }
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

fn insert_purchase_items(
    conn: &Connection,
    invoice_id: i64,
    input: &CreatePurchaseInvoiceInput,
) -> AppResult<()> {
    for item in &input.items {
        let line_total = item.line_total;
        let effective_unit_cost = line_total / item.quantity;
        let invoice_unit_price = effective_unit_cost;
        let item_discount = 0_i64;
        let shipping_alloc = 0_i64;
        let inventory_cost_value = line_total;

        conn.execute(
            "INSERT INTO purchase_invoice_items (
                purchase_invoice_id, product_id, quantity, invoice_unit_price,
                discount_amount, shipping_allocation, effective_unit_cost, inventory_cost_value, line_total
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                invoice_id,
                item.product_id,
                item.quantity,
                invoice_unit_price,
                item_discount,
                shipping_alloc,
                effective_unit_cost,
                inventory_cost_value,
                line_total
            ],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::database::connection::init_db_pool;
    use crate::services::product_service::ProductService;
    use tempfile::tempdir;

    #[test]
    fn test_moving_average_cost_calculation() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let pool = init_db_pool(db_path).unwrap();

        let product_service = ProductService::new(pool.clone());
        let prod = product_service
            .create(crate::domain::models::CreateProductInput {
                product_code: "HH001".to_string(),
                product_name: "Cám Lợn Nái".to_string(),
                animal_category: "heo".to_string(),
                package_weight_grams: 25000,
                package_weight_unit: Some("kg".to_string()),
                inventory_unit: "Bao".to_string(),
                brand: None,
                active: true,
                notes: None,
            })
            .unwrap();

        assert_eq!(prod.current_stock, 0);
        assert_eq!(prod.average_cost, 0);

        let supplier_service =
            crate::services::supplier_service::SupplierService::new(pool.clone());
        let supp = supplier_service
            .create(crate::domain::models::CreateSupplierInput {
                company_name: "Công ty Cám CP".to_string(),
                phone: None,
                address: None,
                tax_code: None,
                contact_person: None,
                bank_account: None,
                notes: None,
            })
            .unwrap();

        let purchase_service = PurchaseService::new(pool.clone());
        let draft = purchase_service
            .create_draft(CreatePurchaseInvoiceInput {
                invoice_number: "HD001".to_string(),
                invoice_date: "2026-08-01".to_string(),
                received_date: "2026-08-01".to_string(),
                supplier_id: supp.id,
                notes: None,
                items: vec![crate::domain::models::CreatePurchaseItemInput {
                    product_id: prod.id,
                    quantity: 10,
                    line_total: 3_000_000,
                    notes: None,
                }],
            })
            .unwrap();

        let confirmed = purchase_service.confirm(draft.id).unwrap();
        assert_eq!(confirmed.status, "xac_nhan");

        let updated_prod = product_service.get_by_id(prod.id).unwrap().unwrap();
        assert_eq!(updated_prod.current_stock, 10);
        assert_eq!(updated_prod.average_cost, 300000); // New documents ignore legacy shipping fields.
    }
}
