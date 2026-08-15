use serde::Serialize;
use serde_json::{json, Value};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Conflict error: {0}")]
    Conflict(String),

    #[error("Product code exists: {0}")]
    ProductCodeExists(String),

    #[error("Invalid discount: {0}")]
    InvalidDiscount(String),

    #[error("Insufficient stock: {0}")]
    InsufficientStock(String),

    #[error("Invalid invoice state: {0}")]
    InvalidInvoiceState(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Import error: {0}")]
    Import(String),

    #[error("Backup error: {0}")]
    Backup(String),

    #[error("Restore error: {0}")]
    Restore(String),

    #[error("Restore rollback failed: {0}")]
    RestoreRollbackFailed(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorResponse<'a> {
    code: &'static str,
    message: String,
    details: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    technical_id: Option<&'a str>,
}

impl AppError {
    fn response(&self) -> ErrorResponse<'_> {
        let (code, message) = match self {
            Self::Validation(message) => ("VALIDATION_ERROR", message.clone()),
            Self::NotFound(message) => ("NOT_FOUND", message.clone()),
            Self::Conflict(message) => ("CONFLICT", message.clone()),
            Self::ProductCodeExists(message) => ("PRODUCT_CODE_EXISTS", message.clone()),
            Self::InvalidDiscount(message) => ("INVALID_DISCOUNT", message.clone()),
            Self::InsufficientStock(message) => ("INSUFFICIENT_STOCK", message.clone()),
            Self::InvalidInvoiceState(message) => ("INVALID_INVOICE_STATE", message.clone()),
            Self::Import(_) => (
                "IMPORT_ERROR",
                "Không thể nhập dữ liệu. Vui lòng kiểm tra file và thử lại.".to_string(),
            ),
            Self::Backup(_) => (
                "BACKUP_ERROR",
                "Không thể tạo bản sao lưu. Dữ liệu hiện tại không bị thay đổi.".to_string(),
            ),
            Self::Restore(_) => (
                "RESTORE_ERROR",
                "Không thể phục hồi bản sao lưu. Dữ liệu hiện tại không bị thay đổi.".to_string(),
            ),
            Self::RestoreRollbackFailed(_) => (
                "RESTORE_ROLLBACK_FAILED",
                "Không thể tự động khôi phục database ban đầu. Không đóng ứng dụng và hãy liên hệ hỗ trợ."
                    .to_string(),
            ),
            Self::Database(_) | Self::Internal(_) => (
                "INTERNAL_ERROR",
                "Có lỗi khi xử lý dữ liệu. Vui lòng thử lại.".to_string(),
            ),
        };
        ErrorResponse {
            code,
            message,
            details: json!({}),
            technical_id: None,
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.response().serialize(serializer)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
