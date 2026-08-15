use crate::domain::errors::AppResult;
use crate::domain::models::{
    CreateSalesInvoiceInput, PaginatedResult, SalesInvoice, SalesInvoiceListParams,
};
use crate::services::sale_service::SaleService;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_sales_invoices(
    state: State<'_, AppState>,
    params: SalesInvoiceListParams,
) -> AppResult<PaginatedResult<SalesInvoice>> {
    state.with_pool(|pool| {
        let service = SaleService::new(pool);
        let page = params.page.unwrap_or(1);
        let page_size = params.page_size.unwrap_or(20);
        let (items, total) = service.list(
            page,
            page_size,
            params.search,
            params.buyer_type,
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
pub fn get_sales_invoice_by_id(
    state: State<'_, AppState>,
    id: i64,
) -> AppResult<Option<SalesInvoice>> {
    state.with_pool(|pool| SaleService::new(pool).get_by_id(id))
}

#[tauri::command]
pub fn create_sales_invoice_draft(
    state: State<'_, AppState>,
    input: CreateSalesInvoiceInput,
) -> AppResult<SalesInvoice> {
    state.with_pool(|pool| SaleService::new(pool).create_draft(input))
}

#[tauri::command]
pub fn confirm_sales_invoice(state: State<'_, AppState>, id: i64) -> AppResult<SalesInvoice> {
    state.with_pool(|pool| SaleService::new(pool).confirm(id))
}

#[tauri::command]
pub fn update_sales_invoice_draft(
    state: State<'_, AppState>,
    id: i64,
    input: CreateSalesInvoiceInput,
) -> AppResult<SalesInvoice> {
    state.with_pool(|pool| SaleService::new(pool).update_draft(id, input))
}

#[tauri::command]
pub fn delete_sales_invoice_draft(state: State<'_, AppState>, id: i64) -> AppResult<bool> {
    state.with_pool(|pool| SaleService::new(pool).delete_draft(id))
}

#[tauri::command]
pub fn cancel_sales_invoice(
    state: State<'_, AppState>,
    id: i64,
    reason: String,
) -> AppResult<SalesInvoice> {
    state.with_pool(|pool| SaleService::new(pool).cancel(id, reason))
}
