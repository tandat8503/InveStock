use crate::domain::errors::AppResult;
use crate::domain::models::{
    CreatePurchaseInvoiceInput, PaginatedResult, PurchaseInvoice, PurchaseInvoiceListParams,
};
use crate::services::purchase_service::PurchaseService;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_purchase_invoices(
    state: State<'_, AppState>,
    params: PurchaseInvoiceListParams,
) -> AppResult<PaginatedResult<PurchaseInvoice>> {
    state.with_pool(|pool| {
        let service = PurchaseService::new(pool);
        let page = params.page.unwrap_or(1);
        let page_size = params.page_size.unwrap_or(20);
        let (items, total) = service.list(
            page,
            page_size,
            params.search,
            params.supplier_id,
            params.status,
            params.date_from,
            params.date_to,
        )?;
        Ok(PaginatedResult {
            items,
            total: total as i64,
            page: page as i64,
            page_size: page_size as i64,
        })
    })
}

#[tauri::command]
pub fn get_purchase_invoice_by_id(
    state: State<'_, AppState>,
    id: i64,
) -> AppResult<Option<PurchaseInvoice>> {
    state.with_pool(|pool| PurchaseService::new(pool).get_by_id(id))
}

#[tauri::command]
pub fn create_purchase_invoice_draft(
    state: State<'_, AppState>,
    input: CreatePurchaseInvoiceInput,
) -> AppResult<PurchaseInvoice> {
    state.with_pool(|pool| PurchaseService::new(pool).create_draft(input))
}

#[tauri::command]
pub fn confirm_purchase_invoice(state: State<'_, AppState>, id: i64) -> AppResult<PurchaseInvoice> {
    state.with_pool(|pool| PurchaseService::new(pool).confirm(id))
}

#[tauri::command]
pub fn update_purchase_invoice_draft(
    state: State<'_, AppState>,
    id: i64,
    input: CreatePurchaseInvoiceInput,
) -> AppResult<PurchaseInvoice> {
    state.with_pool(|pool| PurchaseService::new(pool).update_draft(id, input))
}

#[tauri::command]
pub fn delete_purchase_invoice_draft(state: State<'_, AppState>, id: i64) -> AppResult<bool> {
    state.with_pool(|pool| PurchaseService::new(pool).delete_draft(id))
}

#[tauri::command]
pub fn cancel_purchase_invoice(
    state: State<'_, AppState>,
    id: i64,
    reason: String,
) -> AppResult<PurchaseInvoice> {
    state.with_pool(|pool| PurchaseService::new(pool).cancel(id, reason))
}
