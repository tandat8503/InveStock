use std::path::Path;
use tauri::{AppHandle, Manager, State};

use crate::domain::errors::{AppError, AppResult};
use crate::domain::models::BackupStatusDTO;
use crate::services::backup_service::BackupService;
use crate::services::settings_service::SettingsService;
use crate::state::AppState;

#[tauri::command]
pub fn create_backup(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    dest_path: String,
) -> AppResult<String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Backup(e.to_string()))?;
    let db_path = app_data_dir.join("feed-inventory.db");

    let default_folder = app_data_dir.join("backups").to_string_lossy().to_string();
    state.with_pool(|pool| {
        let result = BackupService::new(pool.clone(), db_path).create_backup(Path::new(&dest_path));
        let settings_service = SettingsService::new(pool);
        let mut settings = settings_service.get(default_folder)?;
        match &result {
            Ok(path) => {
                settings.last_successful_backup_date =
                    chrono::Local::now().format("%Y-%m-%d").to_string();
                settings.last_backup_file = path.clone();
                settings.last_backup_error.clear();
            }
            Err(error) => settings.last_backup_error = error.to_string(),
        }
        settings_service.update(settings)?;
        result
    })
}

#[tauri::command]
pub fn restore_backup(state: State<'_, AppState>, source_path: String) -> AppResult<bool> {
    BackupService::restore_backup(&state, Path::new(&source_path))
}

fn current_status(app: &AppHandle, state: &State<'_, AppState>) -> AppResult<BackupStatusDTO> {
    let default_folder = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Backup(e.to_string()))?
        .join("backups")
        .to_string_lossy()
        .to_string();
    state.with_pool(|pool| {
        let settings = SettingsService::new(pool).get(default_folder)?;
        Ok(BackupService::backup_status(&settings))
    })
}

#[tauri::command]
pub fn get_backup_status(app: AppHandle, state: State<'_, AppState>) -> AppResult<BackupStatusDTO> {
    current_status(&app, &state)
}

#[tauri::command]
pub fn run_backup_health_check(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<BackupStatusDTO> {
    current_status(&app, &state)
}
