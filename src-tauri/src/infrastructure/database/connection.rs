use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Result;
use std::fs;
use std::path::PathBuf;

use super::migrations::run_migrations;

pub type DbPool = Pool<SqliteConnectionManager>;

pub fn init_db_pool(db_path: PathBuf) -> Result<DbPool> {
    let pool = init_db_pool_without_migrations(db_path)?;
    {
        let conn = pool.get().map_err(|e| {
            rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(e.to_string()))
        })?;
        run_migrations(&conn)?;
        let integrity: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        if integrity != "ok" {
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(11),
                Some(format!("integrity_check failed: {integrity}")),
            ));
        }
        let foreign_key_errors: i64 =
            conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })?;
        if foreign_key_errors != 0 {
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(19),
                Some("foreign_key_check failed after migration".into()),
            ));
        }
    }
    Ok(pool)
}

pub fn init_db_pool_without_migrations(db_path: PathBuf) -> Result<DbPool> {
    if let Some(parent) = db_path.parent() {
        if !parent.exists() {
            let _ = fs::create_dir_all(parent);
        }
    }

    let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = -8000;
            PRAGMA temp_store = MEMORY;
            PRAGMA busy_timeout = 5000;
            ",
        )?;
        Ok(())
    });

    let pool = Pool::new(manager).map_err(|e| {
        rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(e.to_string()))
    })?;

    Ok(pool)
}
