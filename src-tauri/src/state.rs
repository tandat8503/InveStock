use std::path::PathBuf;
use std::sync::{Mutex, RwLock, RwLockReadGuard, RwLockWriteGuard};

use crate::domain::errors::{AppError, AppResult};
use crate::infrastructure::database::connection::DbPool;

pub struct AppState {
    pool: Mutex<Option<DbPool>>,
    operation_lock: RwLock<()>,
    pub db_path: PathBuf,
}

impl AppState {
    pub fn new(pool: DbPool, db_path: PathBuf) -> Self {
        Self {
            pool: Mutex::new(Some(pool)),
            operation_lock: RwLock::new(()),
            db_path,
        }
    }

    pub fn read_operation(&self) -> AppResult<RwLockReadGuard<'_, ()>> {
        self.operation_lock
            .read()
            .map_err(|_| AppError::Internal("Khóa thao tác bị lỗi".to_string()))
    }

    pub fn write_operation(&self) -> AppResult<RwLockWriteGuard<'_, ()>> {
        self.operation_lock
            .write()
            .map_err(|_| AppError::Internal("Khóa thao tác bị lỗi".to_string()))
    }

    pub fn pool(&self) -> AppResult<DbPool> {
        self.pool
            .lock()
            .map_err(|_| AppError::Internal("Trạng thái database bị lỗi".to_string()))?
            .as_ref()
            .cloned()
            .ok_or_else(|| AppError::Restore("Database đang được phục hồi".to_string()))
    }

    pub fn with_pool<T>(&self, operation: impl FnOnce(DbPool) -> AppResult<T>) -> AppResult<T> {
        let _guard = self.read_operation()?;
        operation(self.pool()?)
    }

    pub fn take_pool(&self) -> AppResult<DbPool> {
        self.pool
            .lock()
            .map_err(|_| AppError::Internal("Trạng thái database bị lỗi".to_string()))?
            .take()
            .ok_or_else(|| AppError::Restore("Database chưa sẵn sàng".to_string()))
    }

    pub fn replace_pool(&self, pool: DbPool) -> AppResult<()> {
        *self
            .pool
            .lock()
            .map_err(|_| AppError::Internal("Trạng thái database bị lỗi".to_string()))? =
            Some(pool);
        Ok(())
    }
}
