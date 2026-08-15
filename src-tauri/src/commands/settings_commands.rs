use crate::domain::errors::{AppError, AppResult};
use crate::domain::models::AppSettingsDTO;
use crate::services::settings_service::SettingsService;
use crate::state::AppState;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn get_settings(app: AppHandle, state: State<'_, AppState>) -> AppResult<AppSettingsDTO> {
    let folder = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(e.to_string()))?
        .join("backups");
    state.with_pool(|pool| SettingsService::new(pool).get(folder.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn update_settings(
    state: State<'_, AppState>,
    settings: AppSettingsDTO,
) -> AppResult<AppSettingsDTO> {
    state.with_pool(|pool| SettingsService::new(pool).update(settings))
}
