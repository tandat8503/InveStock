use crate::domain::errors::AppResult;
use crate::domain::models_seed::{DatabaseStats, SeedResult};
use crate::services::seed_service::SeedService;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_db_stats(state: State<'_, AppState>) -> AppResult<DatabaseStats> {
    state.with_pool(|pool| SeedService::new(pool).get_db_stats())
}

#[tauri::command]
pub fn seed_demo_data(state: State<'_, AppState>, clear_existing: bool) -> AppResult<SeedResult> {
    state.with_pool(|pool| SeedService::new(pool).seed_demo_data(clear_existing))
}
