use crate::domain::errors::AppResult;
use crate::domain::models::{
    CreateSupplierInput, PaginatedResult, Supplier, SupplierListParams, SupplierStatsDTO,
    UpdateSupplierInput,
};
use crate::services::supplier_service::SupplierService;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_suppliers(
    state: State<'_, AppState>,
    params: SupplierListParams,
) -> AppResult<PaginatedResult<Supplier>> {
    state.with_pool(|pool| {
        let mut suppliers = SupplierService::new(pool).list(params.active_only)?;
        if let Some(search) = params.search.map(|value| value.trim().to_lowercase()) {
            if !search.is_empty() {
                suppliers.retain(|supplier| {
                    supplier.company_name.to_lowercase().contains(&search)
                        || supplier
                            .phone
                            .as_deref()
                            .is_some_and(|phone| phone.to_lowercase().contains(&search))
                        || supplier
                            .address
                            .as_deref()
                            .is_some_and(|address| address.to_lowercase().contains(&search))
                });
            }
        }
        let total = suppliers.len() as i64;
        let page = params.page.unwrap_or(1).max(1);
        let page_size = params.page_size.unwrap_or(20).clamp(1, 100);
        let start = ((page - 1) * page_size) as usize;
        let items = suppliers
            .into_iter()
            .skip(start)
            .take(page_size as usize)
            .collect();
        Ok(PaginatedResult {
            items,
            total,
            page,
            page_size,
        })
    })
}

#[tauri::command]
pub fn get_supplier_by_id(state: State<'_, AppState>, id: i64) -> AppResult<Option<Supplier>> {
    state.with_pool(|pool| SupplierService::new(pool).get_by_id(id))
}

#[tauri::command]
pub fn get_supplier_stats(state: State<'_, AppState>, id: i64) -> AppResult<SupplierStatsDTO> {
    state.with_pool(|pool| SupplierService::new(pool).get_stats(id))
}

#[tauri::command]
pub fn create_supplier(
    state: State<'_, AppState>,
    input: CreateSupplierInput,
) -> AppResult<Supplier> {
    state.with_pool(|pool| SupplierService::new(pool).create(input))
}

#[tauri::command]
pub fn update_supplier(
    state: State<'_, AppState>,
    input: UpdateSupplierInput,
) -> AppResult<Supplier> {
    state.with_pool(|pool| SupplierService::new(pool).update(input))
}

#[tauri::command]
pub fn toggle_supplier_active(state: State<'_, AppState>, id: i64) -> AppResult<Supplier> {
    state.with_pool(|pool| SupplierService::new(pool).toggle_active(id))
}

#[tauri::command]
pub fn delete_supplier(state: State<'_, AppState>, id: i64) -> AppResult<bool> {
    state.with_pool(|pool| SupplierService::new(pool).delete(id))
}
