use crate::domain::errors::AppResult;
use crate::domain::models::{CreateSupplierPaymentInput, SupplierPayment};
use crate::services::payment_service::PaymentService;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn record_supplier_payment(
    state: State<'_, AppState>,
    input: CreateSupplierPaymentInput,
) -> AppResult<SupplierPayment> {
    state.with_pool(|pool| PaymentService::new(pool).record(input))
}

#[tauri::command]
pub fn get_supplier_payments(
    state: State<'_, AppState>,
    purchase_invoice_id: i64,
) -> AppResult<Vec<SupplierPayment>> {
    state.with_pool(|pool| PaymentService::new(pool).list(purchase_invoice_id))
}

#[tauri::command]
pub fn void_supplier_payment(
    state: State<'_, AppState>,
    id: i64,
    reason: String,
) -> AppResult<SupplierPayment> {
    state.with_pool(|pool| PaymentService::new(pool).void(id, reason))
}
