use crate::domain::errors::{AppError, AppResult};
use crate::domain::models::{
    CreateProductInput, PaginatedResult, Product, ProductListParams, UpdateProductInput,
};
use crate::domain::validation::{non_negative, one_of, required};
use crate::infrastructure::database::connection::DbPool;
use rusqlite::{params, OptionalExtension};

pub struct ProductService {
    pool: DbPool,
}

impl ProductService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn get_by_id(&self, id: i64) -> AppResult<Option<Product>> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, product_code, product_name, animal_category, package_weight_grams,
                    package_weight_unit, inventory_unit, brand, latest_purchase_price,
                    average_cost, current_sale_price, current_stock, active, notes,
                    created_at, updated_at,package_weight_known,latest_purchase_price_known,current_inventory_value
             FROM products WHERE id = ?1",
        )?;

        let product = stmt
            .query_row(params![id], |row| {
                Ok(Product {
                    id: row.get(0)?,
                    product_code: row.get(1)?,
                    product_name: row.get(2)?,
                    animal_category: row.get(3)?,
                    package_weight_grams: row.get(4)?,
                    package_weight_unit: row.get(5)?,
                    inventory_unit: row.get(6)?,
                    brand: row.get(7)?,
                    latest_purchase_price: row.get(8)?,
                    average_cost: row.get(9)?,
                    current_sale_price: row.get(10)?,
                    current_stock: row.get(11)?,
                    active: row.get::<_, i32>(12)? != 0,
                    notes: row.get(13)?,
                    created_at: row.get(14)?,
                    updated_at: row.get(15)?,
                    package_weight_known: row.get::<_, i64>(16)? != 0,
                    latest_purchase_price_known: row.get::<_, i64>(17)? != 0,
                    current_inventory_value: row.get(18)?,
                })
            })
            .optional()?;

        Ok(product)
    }

    pub fn list(&self, params: ProductListParams) -> AppResult<PaginatedResult<Product>> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let page = params.page.unwrap_or(1).max(1);
        let page_size = params.page_size.unwrap_or(50).max(1);
        let offset = (page - 1) * page_size;

        let mut conditions = Vec::new();
        let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref search) = params.search {
            if !search.trim().is_empty() {
                let pattern = format!("%{}%", search.trim());
                conditions.push("(product_code LIKE ? OR product_name LIKE ? OR brand LIKE ?)");
                query_params.push(Box::new(pattern.clone()));
                query_params.push(Box::new(pattern.clone()));
                query_params.push(Box::new(pattern));
            }
        }

        if let Some(ref cat) = params.animal_category {
            if !cat.trim().is_empty() {
                conditions.push("animal_category = ?");
                query_params.push(Box::new(cat.clone()));
            }
        }

        if let Some(ref unit) = params.inventory_unit {
            if !unit.trim().is_empty() {
                conditions.push("inventory_unit = ?");
                query_params.push(Box::new(unit.clone()));
            }
        }

        if let Some(active) = params.active_only {
            conditions.push(if active { "active = 1" } else { "active = 0" });
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let count_sql = format!("SELECT COUNT(*) FROM products {}", where_clause);
        let params_refs: Vec<&dyn rusqlite::ToSql> =
            query_params.iter().map(|p| p.as_ref()).collect();
        let total: i64 = conn.query_row(&count_sql, params_refs.as_slice(), |row| row.get(0))?;

        let select_sql = format!(
            "SELECT id, product_code, product_name, animal_category, package_weight_grams,
                    package_weight_unit, inventory_unit, brand, latest_purchase_price,
                    average_cost, current_sale_price, current_stock, active, notes,
                    created_at, updated_at,package_weight_known,latest_purchase_price_known,current_inventory_value
             FROM products {} ORDER BY id DESC LIMIT ? OFFSET ?",
            where_clause
        );

        let mut all_params = query_params;
        all_params.push(Box::new(page_size));
        all_params.push(Box::new(offset));
        let all_params_refs: Vec<&dyn rusqlite::ToSql> =
            all_params.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&select_sql)?;
        let items_iter = stmt.query_map(all_params_refs.as_slice(), |row| {
            Ok(Product {
                id: row.get(0)?,
                product_code: row.get(1)?,
                product_name: row.get(2)?,
                animal_category: row.get(3)?,
                package_weight_grams: row.get(4)?,
                package_weight_unit: row.get(5)?,
                inventory_unit: row.get(6)?,
                brand: row.get(7)?,
                latest_purchase_price: row.get(8)?,
                average_cost: row.get(9)?,
                current_sale_price: row.get(10)?,
                current_stock: row.get(11)?,
                active: row.get::<_, i32>(12)? != 0,
                notes: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
                package_weight_known: row.get::<_, i64>(16)? != 0,
                latest_purchase_price_known: row.get::<_, i64>(17)? != 0,
                current_inventory_value: row.get(18)?,
            })
        })?;

        let mut items = Vec::new();
        for item in items_iter {
            items.push(item?);
        }

        Ok(PaginatedResult {
            items,
            total,
            page,
            page_size,
        })
    }

    pub fn create(&self, input: CreateProductInput) -> AppResult<Product> {
        validate_product(
            &input.product_code,
            &input.product_name,
            &input.animal_category,
            input.package_weight_grams,
            input.package_weight_unit.as_deref().unwrap_or("kg"),
            &input.inventory_unit,
        )?;
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let unit_weight = "g";

        let res = conn.execute(
            "INSERT INTO products (
                product_code, product_name, animal_category, package_weight_grams,
                package_weight_unit, package_weight_known, inventory_unit, brand, active, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                input.product_code.trim(),
                input.product_name.trim(),
                input.animal_category.trim(),
                input.package_weight_grams,
                unit_weight,
                if input.package_weight_grams > 0 { 1 } else { 0 },
                input.inventory_unit.trim(),
                input.brand,
                if input.active { 1 } else { 0 },
                input.notes
            ],
        );

        match res {
            Ok(_) => {
                let id = conn.last_insert_rowid();
                self.get_by_id(id)?
                    .ok_or_else(|| AppError::Internal("Created product not found".to_string()))
            }
            Err(rusqlite::Error::SqliteFailure(err, _)) if err.extended_code == 2067 => {
                Err(AppError::ProductCodeExists(format!(
                    "Mã sản phẩm '{}' đã tồn tại",
                    input.product_code
                )))
            }
            Err(e) => Err(AppError::Database(e.to_string())),
        }
    }

    pub fn update(&self, input: UpdateProductInput) -> AppResult<Product> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let existing = self.get_by_id(input.id)?.ok_or_else(|| {
            AppError::NotFound(format!("Không tìm thấy sản phẩm id {}", input.id))
        })?;

        let product_code = input.product_code.unwrap_or(existing.product_code);
        let product_name = input.product_name.unwrap_or(existing.product_name);
        let animal_category = input.animal_category.unwrap_or(existing.animal_category);
        let package_weight_grams = input
            .package_weight_grams
            .unwrap_or(existing.package_weight_grams);
        let package_weight_unit =
            if input.package_weight_grams.is_some() || input.package_weight_unit.is_some() {
                "g".to_string()
            } else {
                existing.package_weight_unit
            };
        let inventory_unit = input
            .inventory_unit
            .unwrap_or_else(|| existing.inventory_unit.clone());
        let brand = input.brand.or(existing.brand);
        let active = if existing.active { 1 } else { 0 };
        let notes = input.notes.or(existing.notes);

        validate_product(
            &product_code,
            &product_name,
            &animal_category,
            package_weight_grams,
            &package_weight_unit,
            &inventory_unit,
        )?;

        let update_result = conn.execute(
            "UPDATE products SET
                product_code = ?1, product_name = ?2, animal_category = ?3,
                package_weight_grams = ?4, package_weight_unit = ?5, inventory_unit = ?6,
                package_weight_known = CASE WHEN ?4 > 0 THEN 1 ELSE 0 END,
                brand = ?7, active = ?8, notes = ?9,
                updated_at = datetime('now', 'localtime')
             WHERE id = ?10",
            params![
                product_code.trim(),
                product_name.trim(),
                animal_category.trim(),
                package_weight_grams,
                package_weight_unit,
                inventory_unit.trim(),
                brand,
                active,
                notes,
                input.id
            ],
        );
        match update_result {
            Ok(_) => {}
            Err(rusqlite::Error::SqliteFailure(error, _)) if error.extended_code == 2067 => {
                return Err(AppError::ProductCodeExists(format!(
                    "Mã sản phẩm '{}' đã tồn tại",
                    product_code
                )));
            }
            Err(error) => return Err(AppError::Database(error.to_string())),
        }

        self.get_by_id(input.id)?
            .ok_or_else(|| AppError::Internal("Updated product not found".to_string()))
    }
    pub fn toggle_active(&self, id: i64) -> AppResult<Product> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let product = self
            .get_by_id(id)?
            .ok_or_else(|| AppError::NotFound("Không tìm thấy sản phẩm.".to_string()))?;
        if product.active && product.current_stock != 0 {
            return Err(AppError::Conflict(format!(
                "Sản phẩm vẫn còn {} {} trong kho.\nHãy xử lý tồn kho trước khi ngừng sử dụng.",
                product.current_stock, product.inventory_unit
            )));
        }
        let new_active = if product.active { 0 } else { 1 };
        conn.execute(
            "UPDATE products SET active=?1, updated_at=datetime('now','localtime') WHERE id=?2",
            params![new_active, id],
        )?;
        self.get_by_id(id)?
            .ok_or_else(|| AppError::NotFound("Không tìm thấy sản phẩm.".to_string()))
    }

    pub fn delete(&self, id: i64) -> AppResult<bool> {
        let product = self
            .get_by_id(id)?
            .ok_or_else(|| AppError::NotFound("Không tìm thấy sản phẩm.".to_string()))?;
        if product.current_stock != 0 || product.current_inventory_value != 0 {
            return Err(AppError::Conflict(
                "Không thể xóa sản phẩm vì vẫn còn tồn kho hoặc giá trị tồn kho. Hãy xử lý tồn kho trước khi xóa sản phẩm."
                .to_string(),
            ));
        }
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let count: i64 = conn.query_row(
            "SELECT (SELECT COUNT(*) FROM inventory_transactions WHERE product_id=?1) + \
                    (SELECT COUNT(*) FROM purchase_invoice_items WHERE product_id=?1) + \
                    (SELECT COUNT(*) FROM sales_invoice_items WHERE product_id=?1) + \
                    (SELECT COUNT(*) FROM legacy_inventory_summaries WHERE product_id=?1)",
            [id],
            |r| r.get(0),
        )?;
        if count > 0 {
            return Err(AppError::Conflict(
                "Không thể xóa sản phẩm vì đã có dữ liệu nhập, xuất hoặc tồn kho. Bạn có thể ngừng hoạt động sản phẩm thay vì xóa."
                    .to_string(),
            ));
        }
        conn.execute("DELETE FROM products WHERE id=?1", [id])?;
        Ok(true)
    }
}

fn validate_product(
    code: &str,
    name: &str,
    category: &str,
    weight: i64,
    weight_unit: &str,
    inventory_unit: &str,
) -> AppResult<()> {
    required(code, "Mã sản phẩm")?;
    required(name, "Tên sản phẩm")?;
    one_of(
        category,
        &["heo", "ga", "vit", "bo", "de", "khac"],
        "Nhóm vật nuôi",
    )?;
    non_negative(weight, "Trọng lượng đóng gói")?;
    one_of(weight_unit, &["g", "kg"], "Đơn vị trọng lượng")?;
    one_of(inventory_unit, &["Bao", "Tui", "Bich"], "Đơn vị tồn kho")?;
    Ok(())
}
