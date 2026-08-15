use crate::domain::errors::{AppError, AppResult};
use crate::domain::models::{CreateSupplierInput, Supplier, SupplierStatsDTO, UpdateSupplierInput};
use crate::infrastructure::database::connection::DbPool;
use rusqlite::{params, OptionalExtension};

pub struct SupplierService {
    pool: DbPool,
}

impl SupplierService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn get_by_id(&self, id: i64) -> AppResult<Option<Supplier>> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT s.id, s.company_name, s.phone, s.address, s.tax_code, s.contact_person,
                    s.bank_account, s.notes, s.active, s.created_at, s.updated_at,
                    COALESCE((
                      SELECT SUM(grand_total)
                      FROM purchase_invoices
                      WHERE supplier_id = s.id AND status = 'xac_nhan'
                    ), 0) as total_purchased,
                    COALESCE((
                      SELECT SUM(sp.amount)
                      FROM supplier_payments sp
                      JOIN purchase_invoices pi ON pi.id = sp.purchase_invoice_id
                      WHERE pi.supplier_id = s.id AND sp.status = 'active'
                    ), 0) as total_paid
             FROM suppliers s WHERE s.id = ?1",
        )?;

        let supplier = stmt
            .query_row(params![id], |row| {
                let total_purchased: i64 = row.get(11)?;
                let total_paid: i64 = row.get(12)?;
                let total_debt = total_purchased - total_paid;
                Ok(Supplier {
                    id: row.get(0)?,
                    company_name: row.get(1)?,
                    phone: row.get(2)?,
                    address: row.get(3)?,
                    tax_code: row.get(4)?,
                    contact_person: row.get(5)?,
                    bank_account: row.get(6)?,
                    notes: row.get(7)?,
                    active: row.get::<_, i32>(8)? != 0,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                    total_purchased: Some(total_purchased),
                    total_paid: Some(total_paid),
                    total_debt: Some(total_debt),
                })
            })
            .optional()?;

        Ok(supplier)
    }

    pub fn list(&self, active_only: Option<bool>) -> AppResult<Vec<Supplier>> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let sql = if active_only.unwrap_or(false) {
            "SELECT s.id, s.company_name, s.phone, s.address, s.tax_code, s.contact_person,
                    s.bank_account, s.notes, s.active, s.created_at, s.updated_at,
                    COALESCE((
                      SELECT SUM(grand_total)
                      FROM purchase_invoices
                      WHERE supplier_id = s.id AND status = 'xac_nhan'
                    ), 0) as total_purchased,
                    COALESCE((
                      SELECT SUM(sp.amount)
                      FROM supplier_payments sp
                      JOIN purchase_invoices pi ON pi.id = sp.purchase_invoice_id
                      WHERE pi.supplier_id = s.id AND sp.status = 'active'
                    ), 0) as total_paid
             FROM suppliers s WHERE s.active = 1 ORDER BY s.company_name ASC"
        } else {
            "SELECT s.id, s.company_name, s.phone, s.address, s.tax_code, s.contact_person,
                    s.bank_account, s.notes, s.active, s.created_at, s.updated_at,
                    COALESCE((
                      SELECT SUM(grand_total)
                      FROM purchase_invoices
                      WHERE supplier_id = s.id AND status = 'xac_nhan'
                    ), 0) as total_purchased,
                    COALESCE((
                      SELECT SUM(sp.amount)
                      FROM supplier_payments sp
                      JOIN purchase_invoices pi ON pi.id = sp.purchase_invoice_id
                      WHERE pi.supplier_id = s.id AND sp.status = 'active'
                    ), 0) as total_paid
             FROM suppliers s ORDER BY s.company_name ASC"
        };

        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map([], |row| {
            let total_purchased: i64 = row.get(11)?;
            let total_paid: i64 = row.get(12)?;
            let total_debt = total_purchased - total_paid;
            Ok(Supplier {
                id: row.get(0)?,
                company_name: row.get(1)?,
                phone: row.get(2)?,
                address: row.get(3)?,
                tax_code: row.get(4)?,
                contact_person: row.get(5)?,
                bank_account: row.get(6)?,
                notes: row.get(7)?,
                active: row.get::<_, i32>(8)? != 0,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                total_purchased: Some(total_purchased),
                total_paid: Some(total_paid),
                total_debt: Some(total_debt),
            })
        })?;

        let mut items = Vec::new();
        for item in rows {
            items.push(item?);
        }

        Ok(items)
    }

    /// Validates that phone is either None/empty or exactly 10 ASCII digits.
    fn validate_phone(phone: &Option<String>) -> AppResult<()> {
        if let Some(p) = phone {
            let trimmed = p.trim();
            if !trimmed.is_empty() {
                let valid = trimmed.len() == 10 && trimmed.chars().all(|c| c.is_ascii_digit());
                if !valid {
                    return Err(AppError::Validation(
                        "Số điện thoại phải gồm đúng 10 chữ số.".to_string(),
                    ));
                }
            }
        }
        Ok(())
    }

    pub fn create(&self, input: CreateSupplierInput) -> AppResult<Supplier> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        Self::validate_phone(&input.phone)?;
        conn.execute(
            "INSERT INTO suppliers (
                company_name, phone, address, tax_code, contact_person, bank_account, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                input.company_name.trim(),
                input.phone,
                input.address,
                input.tax_code,
                input.contact_person,
                input.bank_account,
                input.notes
            ],
        )?;

        let id = conn.last_insert_rowid();
        self.get_by_id(id)?
            .ok_or_else(|| AppError::Internal("Created supplier not found".to_string()))
    }

    pub fn update(&self, input: UpdateSupplierInput) -> AppResult<Supplier> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let existing = self
            .get_by_id(input.id)?
            .ok_or_else(|| AppError::NotFound(format!("Không tìm thấy NCC id {}", input.id)))?;

        Self::validate_phone(&input.phone)?;
        let company_name = input.company_name.unwrap_or(existing.company_name);
        let phone = input.phone.or(existing.phone);
        let address = input.address.or(existing.address);
        let tax_code = input.tax_code.or(existing.tax_code);
        let contact_person = input.contact_person.or(existing.contact_person);
        let bank_account = input.bank_account.or(existing.bank_account);
        let active = if let Some(a) = input.active {
            if a {
                1
            } else {
                0
            }
        } else if existing.active {
            1
        } else {
            0
        };
        let notes = input.notes.or(existing.notes);

        conn.execute(
            "UPDATE suppliers SET
                company_name = ?1, phone = ?2, address = ?3, tax_code = ?4,
                contact_person = ?5, bank_account = ?6, active = ?7, notes = ?8,
                updated_at = datetime('now', 'localtime')
             WHERE id = ?9",
            params![
                company_name.trim(),
                phone,
                address,
                tax_code,
                contact_person,
                bank_account,
                active,
                notes,
                input.id
            ],
        )?;

        self.get_by_id(input.id)?
            .ok_or_else(|| AppError::Internal("Updated supplier not found".to_string()))
    }

    pub fn toggle_active(&self, id: i64) -> AppResult<Supplier> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let changed = conn.execute(
            "UPDATE suppliers
             SET active = CASE active WHEN 1 THEN 0 ELSE 1 END,
                 updated_at = datetime('now', 'localtime')
             WHERE id = ?1",
            [id],
        )?;
        if changed == 0 {
            return Err(AppError::NotFound(
                "Không tìm thấy nhà cung cấp.".to_string(),
            ));
        }
        self.get_by_id(id)?
            .ok_or_else(|| AppError::NotFound("Không tìm thấy nhà cung cấp.".to_string()))
    }

    pub fn delete(&self, id: i64) -> AppResult<bool> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let invoice_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM purchase_invoices WHERE supplier_id = ?1",
            [id],
            |row| row.get(0),
        )?;
        if invoice_count > 0 {
            return Err(AppError::Conflict(
                "Nhà cung cấp đã có hóa đơn nên không thể xóa. Hãy chuyển sang ngừng hoạt động."
                    .to_string(),
            ));
        }
        Ok(conn.execute("DELETE FROM suppliers WHERE id = ?1", [id])? == 1)
    }

    pub fn get_stats(&self, id: i64) -> AppResult<SupplierStatsDTO> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let total_purchased: i64 = conn.query_row(
            "SELECT COALESCE(SUM(grand_total), 0) FROM purchase_invoices WHERE supplier_id = ?1 AND status = 'xac_nhan'",
            [id],
            |row| row.get(0),
        )?;

        let total_paid: i64 = conn.query_row(
            "SELECT COALESCE(SUM(sp.amount), 0) \
             FROM supplier_payments sp \
             JOIN purchase_invoices pi ON pi.id = sp.purchase_invoice_id \
             WHERE pi.supplier_id = ?1 AND sp.status = 'active'",
            [id],
            |row| row.get(0),
        )?;

        let total_debt = total_purchased - total_paid;

        let confirmed_invoice_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM purchase_invoices WHERE supplier_id = ?1 AND status = 'xac_nhan'",
            [id],
            |row| row.get(0),
        )?;

        let unpaid_invoice_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM purchase_invoices WHERE supplier_id = ?1 AND status = 'xac_nhan' AND remaining_amount > 0",
            [id],
            |row| row.get(0),
        )?;

        let last_payment_date: Option<String> = conn
            .query_row(
                "SELECT MAX(sp.payment_date) \
             FROM supplier_payments sp \
             JOIN purchase_invoices pi ON pi.id = sp.purchase_invoice_id \
             WHERE pi.supplier_id = ?1 AND sp.status = 'active'",
                [id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();

        Ok(SupplierStatsDTO {
            supplier_id: id,
            total_purchased,
            total_paid,
            total_debt,
            confirmed_invoice_count,
            unpaid_invoice_count,
            last_payment_date,
        })
    }
}
