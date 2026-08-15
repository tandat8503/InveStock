use crate::domain::errors::{AppError, AppResult};
use crate::domain::models::AppSettingsDTO;
use crate::infrastructure::database::connection::DbPool;
use rusqlite::OptionalExtension;

pub struct SettingsService {
    pool: DbPool,
}

impl SettingsService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn get(&self, default_backup_folder: String) -> AppResult<AppSettingsDTO> {
        let connection = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let value: Option<String> = connection
            .query_row(
                "SELECT value FROM app_settings WHERE key='application_settings'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(json) = value {
            let mut dto: AppSettingsDTO =
                serde_json::from_str(&json).map_err(|e| AppError::Database(e.to_string()))?;
            if !dto.preferred_supplier_ids.is_empty() {
                let active_ids: Vec<i64> = dto
                    .preferred_supplier_ids
                    .iter()
                    .copied()
                    .filter(|id| {
                        connection
                            .query_row("SELECT active FROM suppliers WHERE id=?1", [id], |r| {
                                r.get::<_, i64>(0)
                            })
                            .ok()
                            == Some(1)
                    })
                    .collect();
                dto.preferred_supplier_ids = active_ids;
            }
            return Ok(dto);
        }
        Ok(AppSettingsDTO {
            store_name: "Cửa hàng".to_string(),
            tax_code: String::new(),
            address: String::new(),
            phone: String::new(),
            currency: "VND".to_string(),
            backup_folder: default_backup_folder,
            automatic_backup_enabled: true,
            backup_retention_count: 10,
            last_successful_backup_date: String::new(),
            last_backup_file: String::new(),
            last_backup_error: String::new(),
            preferred_supplier_ids: Vec::new(),
            low_stock_threshold: 10,
        })
    }

    pub fn update(&self, settings: AppSettingsDTO) -> AppResult<AppSettingsDTO> {
        if settings.store_name.trim().is_empty() {
            return Err(AppError::Validation(
                "Tên cửa hàng không được để trống.".to_string(),
            ));
        }
        if !(1..=365).contains(&settings.backup_retention_count) {
            return Err(AppError::Validation(
                "Số bản backup cần giữ phải từ 1 đến 365.".to_string(),
            ));
        }
        if !(1..=100_000).contains(&settings.low_stock_threshold) {
            return Err(AppError::Validation(
                "Ngưỡng cảnh báo tồn kho phải từ 1 đến 100.000.".to_string(),
            ));
        }
        let unique: std::collections::HashSet<_> =
            settings.preferred_supplier_ids.iter().copied().collect();
        if unique.len() != settings.preferred_supplier_ids.len() {
            return Err(AppError::Validation(
                "Nhà cung cấp ưu tiên không được trùng nhau.".to_string(),
            ));
        }
        for supplier_id in &settings.preferred_supplier_ids {
            let active: Option<i64> = self
                .pool
                .get()
                .map_err(|e| AppError::Database(e.to_string()))?
                .query_row(
                    "SELECT active FROM suppliers WHERE id=?1",
                    [supplier_id],
                    |row| row.get(0),
                )
                .optional()?;
            if active != Some(1) {
                return Err(AppError::Validation(
                    "Nhà cung cấp ưu tiên phải đang hoạt động.".to_string(),
                ));
            }
        }
        let json =
            serde_json::to_string(&settings).map_err(|e| AppError::Internal(e.to_string()))?;
        self.pool.get().map_err(|e| AppError::Database(e.to_string()))?.execute("INSERT INTO app_settings(key,value,updated_at) VALUES('application_settings',?1,datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", [&json])?;
        Ok(settings)
    }
}
