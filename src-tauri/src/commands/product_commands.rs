use crate::domain::errors::AppResult;
use crate::domain::models::{
    CreateProductInput, PaginatedResult, Product, ProductListParams, UpdateProductInput,
};
use crate::services::product_service::ProductService;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_products(
    state: State<'_, AppState>,
    params: ProductListParams,
) -> AppResult<PaginatedResult<Product>> {
    state.with_pool(|pool| ProductService::new(pool).list(params))
}

#[tauri::command]
pub fn get_product_by_id(state: State<'_, AppState>, id: i64) -> AppResult<Option<Product>> {
    state.with_pool(|pool| ProductService::new(pool).get_by_id(id))
}

#[tauri::command]
pub fn create_product(state: State<'_, AppState>, input: CreateProductInput) -> AppResult<Product> {
    state.with_pool(|pool| ProductService::new(pool).create(input))
}

#[tauri::command]
pub fn update_product(state: State<'_, AppState>, input: UpdateProductInput) -> AppResult<Product> {
    state.with_pool(|pool| ProductService::new(pool).update(input))
}

#[tauri::command]
pub fn toggle_product_active(state: State<'_, AppState>, id: i64) -> AppResult<Product> {
    state.with_pool(|pool| ProductService::new(pool).toggle_active(id))
}

#[tauri::command]
pub fn delete_product(state: State<'_, AppState>, id: i64) -> AppResult<bool> {
    state.with_pool(|pool| ProductService::new(pool).delete(id))
}
