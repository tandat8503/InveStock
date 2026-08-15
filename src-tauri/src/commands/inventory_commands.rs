use crate::domain::errors::AppResult;
use crate::domain::models::{
    CreateInventoryAdjustmentInput, CurrentInventoryRowDTO, DashboardAnalyticsDTO,
    DashboardQueryParams, ImportExportReportRowDTO, InventoryAdjustmentDTO, InventoryDataHealth,
    InventorySummary, InventoryTransaction, InvoiceSearchRowDTO, PaginatedResult, PeriodResponse,
    ProductPriceHistoryPoint, ProductSalesReportRowDTO, ReportDataRange, ReportParamsInput,
    RevenueSummaryDTO, SupplierDebtReportRowDTO,
};
use crate::services::inventory_service::InventoryService;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_dashboard_analytics(
    state: State<'_, AppState>,
    params: DashboardQueryParams,
) -> AppResult<DashboardAnalyticsDTO> {
    state.with_pool(|pool| InventoryService::new(pool).get_dashboard_analytics(params))
}

#[tauri::command]
pub fn get_product_price_history(
    state: State<'_, AppState>,
    product_id: i64,
) -> AppResult<Vec<ProductPriceHistoryPoint>> {
    state.with_pool(|pool| InventoryService::new(pool).get_product_price_history(product_id))
}

#[tauri::command]
pub fn get_inventory_summary(
    state: State<'_, AppState>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> AppResult<PeriodResponse<InventorySummary>> {
    state.with_pool(|pool| InventoryService::new(pool).get_inventory_summary(date_from, date_to))
}

#[tauri::command]
pub fn get_product_inventory_history(
    state: State<'_, AppState>,
    product_id: i64,
    page: Option<i64>,
    page_size: Option<i64>,
) -> AppResult<Vec<InventoryTransaction>> {
    state.with_pool(|pool| {
        InventoryService::new(pool).get_product_inventory_history(product_id, page, page_size)
    })
}

#[tauri::command]
pub fn search_invoices(
    state: State<'_, AppState>,
    params: ReportParamsInput,
) -> AppResult<PaginatedResult<InvoiceSearchRowDTO>> {
    state.with_pool(|pool| InventoryService::new(pool).search_invoices(params))
}

#[tauri::command]
pub fn get_revenue_report(
    state: State<'_, AppState>,
    params: ReportParamsInput,
) -> AppResult<RevenueSummaryDTO> {
    state.with_pool(|pool| InventoryService::new(pool).get_revenue_report(params))
}

#[tauri::command]
pub fn get_product_sales_report(
    state: State<'_, AppState>,
    params: ReportParamsInput,
) -> AppResult<Vec<ProductSalesReportRowDTO>> {
    state.with_pool(|pool| InventoryService::new(pool).get_product_sales_report(params))
}

#[tauri::command]
pub fn get_supplier_debt_report(
    state: State<'_, AppState>,
    params: ReportParamsInput,
) -> AppResult<Vec<SupplierDebtReportRowDTO>> {
    state.with_pool(|pool| InventoryService::new(pool).get_supplier_debt_report(params))
}

#[tauri::command]
pub fn get_import_export_report(
    state: State<'_, AppState>,
    params: ReportParamsInput,
) -> AppResult<PeriodResponse<ImportExportReportRowDTO>> {
    state.with_pool(|pool| InventoryService::new(pool).get_import_export_report(params))
}

#[tauri::command]
pub fn get_report_data_range(state: State<'_, AppState>) -> AppResult<ReportDataRange> {
    state.with_pool(|pool| InventoryService::new(pool).get_report_data_range())
}

#[tauri::command]
pub fn create_inventory_adjustment(
    state: State<'_, AppState>,
    input: CreateInventoryAdjustmentInput,
) -> AppResult<InventoryAdjustmentDTO> {
    state.with_pool(|pool| InventoryService::new(pool).create_adjustment(input))
}

#[tauri::command]
pub fn get_inventory_adjustments(
    state: State<'_, AppState>,
) -> AppResult<Vec<InventoryAdjustmentDTO>> {
    state.with_pool(|pool| InventoryService::new(pool).list_adjustments())
}

#[tauri::command]
pub fn get_current_inventory(state: State<'_, AppState>) -> AppResult<Vec<CurrentInventoryRowDTO>> {
    state.with_pool(|pool| InventoryService::new(pool).get_current_inventory())
}

#[tauri::command]
pub fn check_inventory_data_health(state: State<'_, AppState>) -> AppResult<InventoryDataHealth> {
    state.with_pool(|pool| InventoryService::new(pool).check_inventory_data_health())
}
