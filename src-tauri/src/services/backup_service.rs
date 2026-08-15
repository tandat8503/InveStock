use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use crate::domain::errors::{AppError, AppResult};
use crate::domain::models::{AppSettingsDTO, BackupListItemDTO, BackupStatusDTO};
use crate::infrastructure::database::connection::init_db_pool;
use crate::infrastructure::database::connection::DbPool;
use crate::state::AppState;

const DATABASE_ENTRY: &str = "database/feed-inventory.db";
const METADATA_ENTRY: &str = "metadata.json";
const BACKUP_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupMetadata {
    pub format_version: u32,
    pub app_version: String,
    pub schema_version: i64,
    pub created_at: String,
    pub database_size: u64,
    pub sha256: String,
    pub backup_type: String,
    pub device_name: Option<String>,
}

pub struct BackupService {
    pool: DbPool,
    db_path: PathBuf,
}

impl BackupService {
    pub fn new(pool: DbPool, db_path: PathBuf) -> Self {
        Self { pool, db_path }
    }

    pub fn create_backup(&self, destination: &Path) -> AppResult<String> {
        self.create_backup_typed(destination, "manual")
    }

    pub fn create_backup_typed(&self, destination: &Path, backup_type: &str) -> AppResult<String> {
        if !self.db_path.exists() {
            return Err(AppError::Backup("Database nguồn không tồn tại".to_string()));
        }
        let parent = destination
            .parent()
            .ok_or_else(|| AppError::Backup("Đường dẫn lưu bản sao không hợp lệ".to_string()))?;
        if destination.exists() {
            return Err(AppError::Conflict(
                "File backup đã tồn tại. Hãy chọn tên file khác hoặc xác nhận ghi đè trong hộp thoại lưu."
                    .to_string(),
            ));
        }
        fs::create_dir_all(parent).map_err(|e| AppError::Backup(e.to_string()))?;

        let work_dir = std::env::temp_dir().join(format!("investock-backup-{}", Uuid::new_v4()));
        fs::create_dir(&work_dir).map_err(|e| AppError::Backup(e.to_string()))?;
        let snapshot_path = work_dir.join("feed-inventory.db");
        let zip_path = work_dir.join("backup.zip");
        let temporary_destination =
            destination.with_extension(format!("zip.tmp-{}", Uuid::new_v4()));

        let result: AppResult<String> = (|| {
            self.create_sqlite_snapshot(&snapshot_path)?;
            let schema_version = validate_database(&snapshot_path)?;
            let database_size = fs::metadata(&snapshot_path)
                .map_err(|e| AppError::Backup(e.to_string()))?
                .len();
            let sha256 = sha256_file(&snapshot_path)?;
            let metadata = BackupMetadata {
                format_version: BACKUP_FORMAT_VERSION,
                app_version: env!("CARGO_PKG_VERSION").to_string(),
                schema_version,
                created_at: chrono::Utc::now().to_rfc3339(),
                database_size,
                sha256,
                backup_type: backup_type.to_string(),
                device_name: None,
            };
            write_archive(&zip_path, &snapshot_path, &metadata)?;
            validate_backup_package(&zip_path, None)?;

            fs::copy(&zip_path, &temporary_destination)
    .map_err(|e| AppError::Backup(e.to_string()))?;

let temp_file = OpenOptions::new()
    .write(true)
    .open(&temporary_destination)
    .map_err(|e| AppError::Backup(e.to_string()))?;

temp_file
    .sync_all()
    .map_err(|e| AppError::Backup(e.to_string()))?;

drop(temp_file);

fs::rename(&temporary_destination, destination)
    .map_err(|e| AppError::Backup(e.to_string()))?;
            Ok(destination.to_string_lossy().to_string())
        })();

        let _ = fs::remove_file(&temporary_destination);
        let _ = fs::remove_dir_all(&work_dir);
        result
    }

    fn create_sqlite_snapshot(&self, snapshot_path: &Path) -> AppResult<()> {
        let source = self
            .pool
            .get()
            .map_err(|e| AppError::Backup(e.to_string()))?;
        let mut destination = rusqlite::Connection::open(snapshot_path)
            .map_err(|e| AppError::Backup(e.to_string()))?;
        let backup = rusqlite::backup::Backup::new(&source, &mut destination)
            .map_err(|e| AppError::Backup(e.to_string()))?;
        backup
            .run_to_completion(64, Duration::from_millis(10), None)
            .map_err(|e| AppError::Backup(e.to_string()))?;
        drop(backup);
        destination
            .execute_batch("PRAGMA journal_mode=DELETE;")
            .map_err(|e| AppError::Backup(e.to_string()))?;
        Ok(())
    }

    pub fn restore_backup(state: &AppState, source: &Path) -> AppResult<bool> {
        let _exclusive = state.write_operation()?;
        let parent = state
            .db_path
            .parent()
            .ok_or_else(|| AppError::Restore("Đường dẫn database không hợp lệ".to_string()))?;
        let staging_dir = parent.join(format!(".restore-{}", Uuid::new_v4()));
        fs::create_dir(&staging_dir).map_err(|e| AppError::Restore(e.to_string()))?;
        let staged = staging_dir.join("feed-inventory.db");
        let rollback = parent.join(format!(".rollback-{}.db", Uuid::new_v4()));

        let result: AppResult<bool> = (|| {
            let pool = state.pool()?;
            let schema: i64 = pool
                .get()
                .map_err(|e| AppError::Restore(e.to_string()))?
                .query_row(
                    "SELECT COALESCE(MAX(version),0) FROM schema_migrations",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| AppError::Restore(e.to_string()))?;
            let metadata = validate_backup_package(source, Some(schema))
                .map_err(|error| AppError::Restore(error.to_string()))?;
            extract_restore_database(source, &staged)?;
            if metadata.format_version != BACKUP_FORMAT_VERSION
                || metadata.app_version.trim().is_empty()
                || metadata.schema_version > schema
            {
                return Err(AppError::Restore(
                    "Bản sao lưu không tương thích với phiên bản hiện tại".to_string(),
                ));
            }
            if sha256_file(&staged).map_err(|e| AppError::Restore(e.to_string()))?
                != metadata.sha256
            {
                return Err(AppError::Restore(
                    "Checksum bản sao lưu không khớp".to_string(),
                ));
            }
            validate_database(&staged).map_err(|e| AppError::Restore(e.to_string()))?;

            let recovery = parent
                .join("recovery-backups")
                .join(format!("pre_restore_{}.zip", Uuid::new_v4()));
            BackupService::new(pool.clone(), state.db_path.clone())
                .create_backup_typed(&recovery, "pre_restore")?;
            pool.get()
                .map_err(|e| AppError::Restore(e.to_string()))?
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                .map_err(|e| AppError::Restore(e.to_string()))?;
            drop(pool);
            let old_pool = state.take_pool()?;
            drop(old_pool);
            if let Err(error) = remove_sidecars(&state.db_path) {
                state.replace_pool(
                    init_db_pool(state.db_path.clone())
                        .map_err(|e| AppError::Restore(e.to_string()))?,
                )?;
                return Err(error);
            }
            fs::rename(&state.db_path, &rollback).map_err(|e| AppError::Restore(e.to_string()))?;
            if let Err(error) = fs::rename(&staged, &state.db_path) {
                restore_rollback(state, &rollback)?;
                return Err(AppError::Restore(error.to_string()));
            }
            let reopened = init_db_pool(state.db_path.clone());
            let reopen_error = match reopened {
                Ok(new_pool) => match validate_database(&state.db_path) {
                    Ok(_) => {
                        state.replace_pool(new_pool)?;
                        fs::remove_file(&rollback).map_err(|e| AppError::Restore(e.to_string()))?;
                        return Ok(true);
                    }
                    Err(error) => {
                        drop(new_pool);
                        error.to_string()
                    }
                },
                Err(error) => error.to_string(),
            };
            {
                fs::remove_file(&state.db_path).map_err(|e| AppError::Restore(e.to_string()))?;
                restore_rollback(state, &rollback)?;
                Err(AppError::Restore(reopen_error))
            }
        })();
        let _ = fs::remove_dir_all(staging_dir);
        result
    }

    pub fn list_backups(folder: &Path) -> AppResult<Vec<BackupListItemDTO>> {
        if !folder.exists() {
            return Ok(Vec::new());
        }
        let mut backups = Vec::new();
        for entry in fs::read_dir(folder).map_err(|e| AppError::Backup(e.to_string()))? {
            let path = entry.map_err(|e| AppError::Backup(e.to_string()))?.path();
            if path.extension().and_then(|value| value.to_str()) != Some("zip") {
                continue;
            }
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string();
            match validate_backup_package(&path, None) {
                Ok(metadata) => backups.push(BackupListItemDTO {
                    file_name,
                    file_path: path.to_string_lossy().to_string(),
                    created_at: metadata.created_at,
                    backup_type: metadata.backup_type,
                    valid: true,
                }),
                Err(_) => backups.push(BackupListItemDTO {
                    file_name,
                    file_path: path.to_string_lossy().to_string(),
                    created_at: String::new(),
                    backup_type: "unknown".to_string(),
                    valid: false,
                }),
            }
        }
        backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
        Ok(backups)
    }

    pub fn validate_backup(path: &Path) -> AppResult<BackupListItemDTO> {
        let metadata = validate_backup_package(path, None)?;
        Ok(BackupListItemDTO {
            file_name: path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string(),
            file_path: path.to_string_lossy().to_string(),
            created_at: metadata.created_at,
            backup_type: metadata.backup_type,
            valid: true,
        })
    }

    pub fn backup_status(settings: &AppSettingsDTO) -> BackupStatusDTO {
        let folder = Path::new(&settings.backup_folder);
        let folder_writable = check_folder_writable(folder).is_ok();
        let last_path = Path::new(&settings.last_backup_file);
        let using_fallback = !settings.last_backup_error.is_empty()
            && !settings.last_backup_file.is_empty()
            && last_path.parent().is_some_and(|parent| parent != folder);
        let last_valid = !settings.last_backup_file.is_empty()
            && last_path.exists()
            && validate_backup_package(last_path, None).is_ok();
        let days_since_last_backup =
            chrono::NaiveDate::parse_from_str(&settings.last_successful_backup_date, "%Y-%m-%d")
                .ok()
                .map(|date| (chrono::Local::now().date_naive() - date).num_days().max(0));
        let (healthy, message) = if using_fallback && last_valid {
            (
                true,
                "Đã sao lưu vào thư mục an toàn nội bộ vì thư mục đã chọn không ghi được"
                    .to_string(),
            )
        } else if !folder_writable {
            (false, "Không thể ghi vào thư mục backup".to_string())
        } else if !last_valid {
            (false, "Chưa có bản backup hợp lệ".to_string())
        } else if days_since_last_backup.is_some_and(|days| days > 1) {
            (
                false,
                format!(
                    "Cần chú ý: chưa backup trong {} ngày",
                    days_since_last_backup.unwrap_or_default()
                ),
            )
        } else {
            (true, "Dữ liệu đang được sao lưu an toàn".to_string())
        };
        BackupStatusDTO {
            healthy,
            folder_writable,
            using_fallback,
            preferred_folder_error: using_fallback.then(|| {
                if settings.last_backup_error.is_empty() {
                    "Thư mục backup đã chọn hiện không ghi được".to_string()
                } else {
                    settings.last_backup_error.clone()
                }
            }),
            message,
            last_backup_date: settings.last_successful_backup_date.clone(),
            last_backup_file: settings.last_backup_file.clone(),
            days_since_last_backup,
        }
    }

    pub fn apply_automatic_retention(folder: &Path, retention_count: usize) -> AppResult<()> {
        let mut automatic: Vec<PathBuf> = fs::read_dir(folder)
            .map_err(|e| AppError::Backup(e.to_string()))?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|name| {
                        name.starts_with("InveStock_Auto_") && name.ends_with(".zip")
                    })
            })
            .collect();
        automatic.sort();
        let keep = retention_count.max(1);
        let remove_count = automatic.len().saturating_sub(keep);
        for path in automatic.into_iter().take(remove_count) {
            fs::remove_file(path).map_err(|e| AppError::Backup(e.to_string()))?;
        }
        Ok(())
    }

    pub fn run_daily_automatic_backup(
        pool: DbPool,
        db_path: PathBuf,
        default_backup_folder: String,
    ) -> AppResult<BackupStatusDTO> {
        use crate::services::settings_service::SettingsService;

        let settings_service = SettingsService::new(pool.clone());
        let fallback_folder = PathBuf::from(&default_backup_folder);
        let mut settings = settings_service.get(default_backup_folder)?;
        if !settings.automatic_backup_enabled {
            return Ok(Self::backup_status(&settings));
        }
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        if settings.last_successful_backup_date == today
            && !settings.last_backup_file.is_empty()
            && validate_backup_package(Path::new(&settings.last_backup_file), None).is_ok()
        {
            return Ok(Self::backup_status(&settings));
        }

        let preferred_folder = PathBuf::from(&settings.backup_folder);
        let result: AppResult<BackupStatusDTO> = (|| {
            let (folder, fallback_warning) = match check_folder_writable(&preferred_folder) {
                Ok(()) => (preferred_folder.clone(), None),
                Err(error) => {
                    check_folder_writable(&fallback_folder)?;
                    (fallback_folder.clone(), Some(error.to_string()))
                }
            };
            let file_name = format!(
                "InveStock_Auto_{}.zip",
                chrono::Local::now().format("%Y-%m-%d_%H%M%S")
            );
            let destination = folder.join(file_name);
            Self::new(pool.clone(), db_path).create_backup_typed(&destination, "automatic")?;
            Self::apply_automatic_retention(
                &folder,
                settings.backup_retention_count.max(1) as usize,
            )?;
            settings.last_successful_backup_date = today;
            settings.last_backup_file = destination.to_string_lossy().to_string();
            settings.last_backup_error = fallback_warning.unwrap_or_default();
            settings_service.update(settings.clone())?;
            Ok(Self::backup_status(&settings))
        })();

        if let Err(error) = &result {
            settings.last_backup_error = error.to_string();
            let _ = settings_service.update(settings);
        }
        result
    }
}

fn check_folder_writable(folder: &Path) -> AppResult<()> {
    fs::create_dir_all(folder).map_err(|e| AppError::Backup(e.to_string()))?;
    let probe = folder.join(format!(".investock-write-test-{}", Uuid::new_v4()));
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .and_then(|file| file.sync_all())
        .map_err(|e| AppError::Backup(e.to_string()))?;
    fs::remove_file(probe).map_err(|e| AppError::Backup(e.to_string()))
}

fn extract_restore_database(source: &Path, destination: &Path) -> AppResult<BackupMetadata> {
    let mut archive =
        ZipArchive::new(File::open(source).map_err(|e| AppError::Restore(e.to_string()))?)
            .map_err(|e| AppError::Restore(e.to_string()))?;
    let names: Vec<String> = (0..archive.len())
        .map(|i| archive.by_index(i).map(|e| e.name().to_string()))
        .collect::<Result<_, _>>()
        .map_err(|e| AppError::Restore(e.to_string()))?;
    if names
        .iter()
        .any(|name| name != METADATA_ENTRY && name != DATABASE_ENTRY)
        || names
            .iter()
            .filter(|n| n.as_str() == METADATA_ENTRY)
            .count()
            != 1
        || names
            .iter()
            .filter(|n| n.as_str() == DATABASE_ENTRY)
            .count()
            != 1
    {
        return Err(AppError::Restore(
            "Backup thiếu hoặc trùng file bắt buộc".to_string(),
        ));
    }
    let metadata = {
        let mut entry = archive
            .by_name(METADATA_ENTRY)
            .map_err(|e| AppError::Restore(e.to_string()))?;
        if entry.size() > 1_048_576 {
            return Err(AppError::Restore("Metadata backup quá lớn".to_string()));
        }
        serde_json::from_reader(&mut entry).map_err(|e| AppError::Restore(e.to_string()))?
    };
    let mut entry = archive
        .by_name(DATABASE_ENTRY)
        .map_err(|e| AppError::Restore(e.to_string()))?;
    if entry.size() > 2_147_483_648 {
        return Err(AppError::Restore(
            "Database backup vượt giới hạn".to_string(),
        ));
    }
    let mut output = File::create_new(destination).map_err(|e| AppError::Restore(e.to_string()))?;
    std::io::copy(&mut entry, &mut output).map_err(|e| AppError::Restore(e.to_string()))?;
    output
        .sync_all()
        .map_err(|e| AppError::Restore(e.to_string()))?;
    Ok(metadata)
}

fn remove_sidecars(database: &Path) -> AppResult<()> {
    let path = database.to_string_lossy();
    for sidecar in [format!("{path}-wal"), format!("{path}-shm")] {
        for attempt in 0..=4 {
            match fs::remove_file(&sidecar) {
                Ok(()) => break,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
                Err(error) if cfg!(windows) && attempt < 4 => {
                    std::thread::sleep(Duration::from_millis(50));
                    if attempt == 3 {
                        eprintln!("Retrying SQLite sidecar cleanup: {sidecar}: {error}");
                    }
                }
                Err(error) => return Err(AppError::Restore(error.to_string())),
            }
        }
    }
    Ok(())
}

fn restore_rollback(state: &AppState, rollback: &Path) -> AppResult<()> {
    match fs::rename(rollback, &state.db_path) {
        Ok(()) => state.replace_pool(
            init_db_pool(state.db_path.clone()).map_err(|e| AppError::Restore(e.to_string()))?,
        ),
        Err(rename_error) => {
            eprintln!(
                "RESTORE_ROLLBACK_FAILED: rollback={} database={} error={rename_error}",
                rollback.display(),
                state.db_path.display()
            );
            if let Ok(pool) = init_db_pool(rollback.to_path_buf()) {
                let _ = state.replace_pool(pool);
            }
            Err(AppError::RestoreRollbackFailed(format!(
                "Rollback file is preserved at {}: {rename_error}",
                rollback.display()
            )))
        }
    }
}

fn validate_database(path: &Path) -> AppResult<i64> {
    let connection =
        rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| AppError::Backup(e.to_string()))?;
    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| AppError::Backup(e.to_string()))?;
    if integrity != "ok" {
        return Err(AppError::Backup(
            "SQLite integrity_check thất bại".to_string(),
        ));
    }
    let foreign_key_errors: i64 = connection
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .map_err(|e| AppError::Backup(e.to_string()))?;
    if foreign_key_errors != 0 {
        return Err(AppError::Backup(
            "SQLite foreign_key_check thất bại".to_string(),
        ));
    }
    connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|e| AppError::Backup(e.to_string()))
}

fn sha256_file(path: &Path) -> AppResult<String> {
    let mut file = File::open(path).map_err(|e| AppError::Backup(e.to_string()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| AppError::Backup(e.to_string()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn write_archive(path: &Path, database: &Path, metadata: &BackupMetadata) -> AppResult<()> {
    let file = File::create(path).map_err(|e| AppError::Backup(e.to_string()))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file(DATABASE_ENTRY, options)
        .map_err(|e| AppError::Backup(e.to_string()))?;
    let mut database_file = File::open(database).map_err(|e| AppError::Backup(e.to_string()))?;
    std::io::copy(&mut database_file, &mut zip).map_err(|e| AppError::Backup(e.to_string()))?;
    zip.start_file(METADATA_ENTRY, options)
        .map_err(|e| AppError::Backup(e.to_string()))?;
    let json = serde_json::to_vec_pretty(metadata).map_err(|e| AppError::Backup(e.to_string()))?;
    zip.write_all(&json)
        .map_err(|e| AppError::Backup(e.to_string()))?;
    zip.finish()
        .map_err(|e| AppError::Backup(e.to_string()))?
        .sync_all()
        .map_err(|e| AppError::Backup(e.to_string()))
}

fn validate_backup_package(
    path: &Path,
    maximum_schema_version: Option<i64>,
) -> AppResult<BackupMetadata> {
    let file = File::open(path).map_err(|e| AppError::Backup(e.to_string()))?;
    let mut archive = ZipArchive::new(file).map_err(|e| AppError::Backup(e.to_string()))?;
    let names: Vec<String> = (0..archive.len())
        .map(|index| {
            archive
                .by_index(index)
                .map(|entry| entry.name().to_string())
        })
        .collect::<Result<_, _>>()
        .map_err(|e| AppError::Backup(e.to_string()))?;
    if names.len() != 2
        || names
            .iter()
            .filter(|name| name.as_str() == METADATA_ENTRY)
            .count()
            != 1
        || names
            .iter()
            .filter(|name| name.as_str() == DATABASE_ENTRY)
            .count()
            != 1
        || names
            .iter()
            .any(|name| name != METADATA_ENTRY && name != DATABASE_ENTRY)
    {
        return Err(AppError::Backup(
            "Backup phải chứa đúng metadata.json và database/feed-inventory.db".to_string(),
        ));
    }
    let metadata: BackupMetadata = {
        let mut entry = archive
            .by_name(METADATA_ENTRY)
            .map_err(|e| AppError::Backup(e.to_string()))?;
        if entry.size() > 1_048_576 {
            return Err(AppError::Backup("Metadata backup quá lớn".to_string()));
        }
        serde_json::from_reader(&mut entry).map_err(|e| AppError::Backup(e.to_string()))?
    };
    if metadata.format_version != BACKUP_FORMAT_VERSION
        || metadata.app_version.trim().is_empty()
        || metadata.sha256.len() != 64
        || metadata.database_size == 0
        || maximum_schema_version.is_some_and(|maximum| metadata.schema_version > maximum)
    {
        return Err(AppError::Backup(
            "Metadata backup không hợp lệ hoặc không tương thích".to_string(),
        ));
    }
    let extracted = std::env::temp_dir().join(format!("investock-verify-{}.db", Uuid::new_v4()));
    let result = (|| {
        let mut entry = archive
            .by_name(DATABASE_ENTRY)
            .map_err(|e| AppError::Backup(e.to_string()))?;
        if entry.size() != metadata.database_size || entry.size() > 2_147_483_648 {
            return Err(AppError::Backup(
                "Kích thước database backup không khớp metadata".to_string(),
            ));
        }
        let mut output =
            File::create_new(&extracted).map_err(|e| AppError::Backup(e.to_string()))?;
        let copied =
            std::io::copy(&mut entry, &mut output).map_err(|e| AppError::Backup(e.to_string()))?;
        if copied != metadata.database_size {
            return Err(AppError::Backup("Database backup không đầy đủ".to_string()));
        }
        output
            .sync_all()
            .map_err(|e| AppError::Backup(e.to_string()))?;
        if sha256_file(&extracted)? != metadata.sha256 {
            return Err(AppError::Backup("Checksum bản sao không khớp".to_string()));
        }
        let actual_schema = validate_database(&extracted)?;
        if actual_schema != metadata.schema_version {
            return Err(AppError::Backup(
                "Schema database không khớp metadata".to_string(),
            ));
        }
        Ok(())
    })();
    let _ = fs::remove_file(extracted);
    result?;
    Ok(metadata)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::database::connection::init_db_pool;

    #[test]
    fn backup_includes_committed_wal_data_and_real_checksum() {
        let directory = tempfile::tempdir().unwrap();
        let database = directory.path().join("feed-inventory.db");
        let pool = init_db_pool(database.clone()).unwrap();
        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO suppliers (company_name) VALUES ('Nhà cung cấp WAL')",
                [],
            )
            .unwrap();
        let archive_path = directory.path().join("safe.zip");

        BackupService::new(pool, database)
            .create_backup(&archive_path)
            .unwrap();

        let mut archive = ZipArchive::new(File::open(archive_path).unwrap()).unwrap();
        let metadata: BackupMetadata = {
            let entry = archive.by_name(METADATA_ENTRY).unwrap();
            serde_json::from_reader(entry).unwrap()
        };
        assert_eq!(metadata.sha256.len(), 64);
        assert_ne!(metadata.sha256, "validated");
        assert!(metadata.database_size > 0);
    }

    #[test]
    fn restore_replaces_database_and_reopens_pool() {
        let directory = tempfile::tempdir().unwrap();
        let database = directory.path().join("feed-inventory.db");
        let pool = init_db_pool(database.clone()).unwrap();
        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO suppliers (company_name) VALUES ('Trước backup')",
                [],
            )
            .unwrap();
        let archive_path = directory.path().join("safe.zip");
        BackupService::new(pool.clone(), database.clone())
            .create_backup(&archive_path)
            .unwrap();
        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO suppliers (company_name) VALUES ('Sau backup')",
                [],
            )
            .unwrap();
        let state = AppState::new(pool, database);

        assert!(BackupService::restore_backup(&state, &archive_path).unwrap());
        let count: i64 = state
            .with_pool(|pool| {
                pool.get()
                    .unwrap()
                    .query_row(
                        "SELECT COUNT(*) FROM suppliers WHERE company_name = 'Sau backup'",
                        [],
                        |row| row.get(0),
                    )
                    .map_err(AppError::from)
            })
            .unwrap();
        assert_eq!(count, 0);
    }
}
