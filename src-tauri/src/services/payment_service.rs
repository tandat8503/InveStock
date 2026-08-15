use crate::domain::errors::{AppError, AppResult};
use crate::domain::models::{CreateSupplierPaymentInput, SupplierPayment};
use crate::domain::validation::{iso_date, one_of, positive};
use crate::infrastructure::database::connection::DbPool;
use rusqlite::{params, TransactionBehavior};

pub struct PaymentService {
    pool: DbPool,
}

impl PaymentService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn list(&self, invoice_id: i64) -> AppResult<Vec<SupplierPayment>> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare("SELECT sp.id,sp.purchase_invoice_id,pi.receipt_code,pi.invoice_number,sp.payment_date,sp.amount,sp.payment_method,sp.transaction_reference,sp.notes,sp.created_at,sp.status,sp.voided_at,sp.void_reason FROM supplier_payments sp JOIN purchase_invoices pi ON pi.id=sp.purchase_invoice_id WHERE sp.purchase_invoice_id=?1 ORDER BY sp.payment_date DESC,sp.id DESC")?;
        let rows = stmt.query_map([invoice_id], |r| {
            Ok(SupplierPayment {
                id: r.get(0)?,
                purchase_invoice_id: r.get(1)?,
                receipt_code: r.get(2)?,
                invoice_number: r.get(3)?,
                payment_date: r.get(4)?,
                amount: r.get(5)?,
                payment_method: r.get(6)?,
                transaction_reference: r.get(7)?,
                notes: r.get(8)?,
                created_at: r.get(9)?,
                status: r.get(10)?,
                voided_at: r.get(11)?,
                void_reason: r.get(12)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn record(&self, input: CreateSupplierPaymentInput) -> AppResult<SupplierPayment> {
        positive(input.amount, "Số tiền thanh toán")?;
        iso_date(&input.payment_date, "Ngày thanh toán")?;
        one_of(
            &input.payment_method,
            &["chuyen_khoan", "tien_mat", "khac"],
            "Phương thức thanh toán",
        )?;
        let mut conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let (status, grand_total, paid, remaining): (String,i64,i64,i64) = tx.query_row("SELECT status,grand_total,paid_amount,remaining_amount FROM purchase_invoices WHERE id=?1", [input.purchase_invoice_id], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))
            .map_err(|_| AppError::NotFound("Không tìm thấy phiếu nhập.".to_string()))?;
        if status != "xac_nhan" {
            return Err(AppError::InvalidInvoiceState(
                "Chỉ phiếu nhập đã xác nhận mới được ghi nhận thanh toán.".to_string(),
            ));
        }
        if input.amount > remaining || paid + input.amount > grand_total {
            return Err(AppError::Validation(
                "Số tiền thanh toán không được lớn hơn số tiền còn nợ.".to_string(),
            ));
        }
        tx.execute("INSERT INTO supplier_payments(purchase_invoice_id,payment_date,amount,payment_method,transaction_reference,notes,status) VALUES(?1,?2,?3,?4,?5,?6,'active')", params![input.purchase_invoice_id,input.payment_date,input.amount,input.payment_method,input.transaction_reference,input.notes])?;
        let payment_id = tx.last_insert_rowid();
        let new_paid = paid + input.amount;
        let new_remaining = grand_total - new_paid;
        let payment_status = if new_remaining == 0 {
            "da_thanh_toan"
        } else if new_paid > 0 {
            "thanh_toan_mot_phan"
        } else {
            "chua_thanh_toan"
        };
        tx.execute("UPDATE purchase_invoices SET paid_amount=?1,remaining_amount=?2,payment_status=?3 WHERE id=?4", params![new_paid,new_remaining,payment_status,input.purchase_invoice_id])?;
        tx.commit()?;
        self.list(input.purchase_invoice_id)?
            .into_iter()
            .find(|payment| payment.id == payment_id)
            .ok_or_else(|| AppError::Internal("Không tải lại được thanh toán.".to_string()))
    }

    pub fn void(&self, id: i64, reason: String) -> AppResult<SupplierPayment> {
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

        let (invoice_id, status): (i64, String) = tx
            .query_row(
                "SELECT purchase_invoice_id, status FROM supplier_payments WHERE id = ?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| AppError::NotFound("Không tìm thấy khoản thanh toán.".to_string()))?;

        if status == "voided" {
            return Err(AppError::Conflict(
                "Thanh toán đã được hủy trước đó.".to_string(),
            ));
        }

        tx.execute(
            "UPDATE supplier_payments SET
                status = 'voided',
                voided_at = datetime('now', 'localtime'),
                void_reason = ?1
             WHERE id = ?2",
            params![reason, id],
        )?;

        let (grand_total, _old_paid): (i64, i64) = tx.query_row(
            "SELECT grand_total, paid_amount FROM purchase_invoices WHERE id = ?1",
            params![invoice_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let new_paid: i64 = tx.query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM supplier_payments WHERE purchase_invoice_id = ?1 AND status = 'active'",
            params![invoice_id],
            |row| row.get(0),
        )?;

        let new_remaining = grand_total - new_paid;
        let payment_status = if new_remaining == 0 {
            "da_thanh_toan"
        } else if new_paid > 0 {
            "thanh_toan_mot_phan"
        } else {
            "chua_thanh_toan"
        };

        tx.execute(
            "UPDATE purchase_invoices SET
                paid_amount = ?1,
                remaining_amount = ?2,
                payment_status = ?3
             WHERE id = ?4",
            params![new_paid, new_remaining, payment_status, invoice_id],
        )?;

        tx.commit()?;

        let payment = conn.query_row(
            "SELECT sp.id, sp.purchase_invoice_id, pi.receipt_code, pi.invoice_number,
                    sp.payment_date, sp.amount, sp.payment_method, sp.transaction_reference,
                    sp.notes, sp.created_at, sp.status, sp.voided_at, sp.void_reason
             FROM supplier_payments sp
             JOIN purchase_invoices pi ON pi.id = sp.purchase_invoice_id
             WHERE sp.id = ?1",
            params![id],
            |r| {
                Ok(SupplierPayment {
                    id: r.get(0)?,
                    purchase_invoice_id: r.get(1)?,
                    receipt_code: r.get(2)?,
                    invoice_number: r.get(3)?,
                    payment_date: r.get(4)?,
                    amount: r.get(5)?,
                    payment_method: r.get(6)?,
                    transaction_reference: r.get(7)?,
                    notes: r.get(8)?,
                    created_at: r.get(9)?,
                    status: r.get(10)?,
                    voided_at: r.get(11)?,
                    void_reason: r.get(12)?,
                })
            },
        )?;

        Ok(payment)
    }
}
