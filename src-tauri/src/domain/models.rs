use serde::{Deserialize, Serialize};

// ============================================================
// Product Models & DTOs
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: i64,
    pub product_code: String,
    pub product_name: String,
    pub animal_category: String,
    pub package_weight_grams: i64,
    pub package_weight_unit: String,
    pub package_weight_known: bool,
    pub inventory_unit: String,
    pub brand: Option<String>,
    pub latest_purchase_price: i64,
    pub latest_purchase_price_known: bool,
    pub average_cost: i64,
    pub current_sale_price: i64,
    pub current_stock: i64,
    pub current_inventory_value: i64,
    pub active: bool,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProductInput {
    pub product_code: String,
    pub product_name: String,
    pub animal_category: String,
    pub package_weight_grams: i64,
    pub package_weight_unit: Option<String>,
    pub inventory_unit: String,
    pub brand: Option<String>,
    #[serde(default = "default_active")]
    pub active: bool,
    pub notes: Option<String>,
}

fn default_active() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProductInput {
    pub id: i64,
    pub product_code: Option<String>,
    pub product_name: Option<String>,
    pub animal_category: Option<String>,
    pub package_weight_grams: Option<i64>,
    pub package_weight_unit: Option<String>,
    pub inventory_unit: Option<String>,
    pub brand: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductListParams {
    pub search: Option<String>,
    pub animal_category: Option<String>,
    pub inventory_unit: Option<String>,
    pub active_only: Option<bool>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResult<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

// ============================================================
// Supplier Models & DTOs
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub id: i64,
    pub company_name: String,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub tax_code: Option<String>,
    pub contact_person: Option<String>,
    pub bank_account: Option<String>,
    pub notes: Option<String>,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub total_purchased: Option<i64>,
    pub total_paid: Option<i64>,
    pub total_debt: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierStatsDTO {
    pub supplier_id: i64,
    pub total_purchased: i64,
    pub total_paid: i64,
    pub total_debt: i64,
    pub confirmed_invoice_count: i64,
    pub unpaid_invoice_count: i64,
    pub last_payment_date: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSupplierInput {
    pub company_name: String,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub tax_code: Option<String>,
    pub contact_person: Option<String>,
    pub bank_account: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSupplierInput {
    pub id: i64,
    pub company_name: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub tax_code: Option<String>,
    pub contact_person: Option<String>,
    pub bank_account: Option<String>,
    pub notes: Option<String>,
    pub active: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierListParams {
    pub search: Option<String>,
    pub active_only: Option<bool>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

// ============================================================
// Purchase Invoice Models
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseInvoice {
    pub id: i64,
    pub receipt_code: String,
    pub invoice_number: String,
    pub invoice_date: String,
    pub received_date: String,
    pub supplier_id: i64,
    pub supplier_name: Option<String>,
    pub subtotal: i64,
    pub discount_amount: i64,
    pub tax_amount: i64,
    pub shipping_cost: i64,
    pub shipping_allocation_method: String,
    pub grand_total: i64,
    pub paid_amount: i64,
    pub remaining_amount: i64,
    pub payment_status: String,
    pub payment_method: String,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub confirmed_at: Option<String>,
    pub cancelled_at: Option<String>,
    pub cancellation_reason: Option<String>,
    pub items: Vec<PurchaseInvoiceItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseInvoiceItem {
    pub id: i64,
    pub purchase_invoice_id: i64,
    pub product_id: i64,
    pub product_code: Option<String>,
    pub product_name: Option<String>,
    pub inventory_unit: Option<String>,
    pub quantity: i64,
    pub invoice_unit_price: i64,
    pub discount_amount: i64,
    pub shipping_allocation: i64,
    pub effective_unit_cost: i64,
    pub inventory_cost_value: i64,
    pub line_total: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePurchaseItemInput {
    pub product_id: i64,
    pub quantity: i64,
    pub line_total: i64, // Authoritative: total value for all units of this line
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePurchaseInvoiceInput {
    pub invoice_number: String,
    pub invoice_date: String,
    pub received_date: String,
    pub supplier_id: i64,
    pub notes: Option<String>,
    pub items: Vec<CreatePurchaseItemInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierPayment {
    pub id: i64,
    pub purchase_invoice_id: i64,
    pub receipt_code: String,
    pub invoice_number: String,
    pub payment_date: String,
    pub amount: i64,
    pub payment_method: String,
    pub transaction_reference: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub status: String,
    pub voided_at: Option<String>,
    pub void_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSupplierPaymentInput {
    pub purchase_invoice_id: i64,
    pub payment_date: String,
    pub amount: i64,
    pub payment_method: String,
    pub transaction_reference: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseInvoiceListParams {
    pub page: Option<usize>,
    pub page_size: Option<usize>,
    pub search: Option<String>,
    pub supplier_id: Option<i64>,
    pub status: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesInvoiceListParams {
    pub page: Option<usize>,
    pub page_size: Option<usize>,
    pub search: Option<String>,
    pub buyer_type: Option<String>,
    pub status: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

// ============================================================
// Sales Invoice Models
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesInvoice {
    pub id: i64,
    pub issue_code: String,
    pub electronic_invoice_number: Option<String>,
    pub invoice_date: String,
    pub buyer_type: String,
    pub buyer_name: Option<String>,
    pub subtotal: i64,
    pub grand_total: i64,
    pub total_cost: i64,
    pub estimated_profit: i64,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub confirmed_at: Option<String>,
    pub cancelled_at: Option<String>,
    pub cancellation_reason: Option<String>,
    pub items: Vec<SalesInvoiceItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesInvoiceItem {
    pub id: i64,
    pub sales_invoice_id: i64,
    pub product_id: i64,
    pub product_code: Option<String>,
    pub product_name: Option<String>,
    pub inventory_unit: Option<String>,
    pub quantity: i64,
    pub unit_sale_price: i64,
    pub unit_cost_at_sale: i64,
    pub line_revenue: i64,
    pub line_cost: i64,
    pub estimated_profit: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSalesItemInput {
    pub product_id: i64,
    pub quantity: i64,
    pub line_total_sale: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSalesInvoiceInput {
    pub electronic_invoice_number: Option<String>,
    pub invoice_date: String,
    pub buyer_type: String,
    pub buyer_name: Option<String>,
    pub notes: Option<String>,
    pub items: Vec<CreateSalesItemInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventorySummary {
    pub product_id: i64,
    pub product_code: String,
    pub product_name: String,
    pub animal_category: String,
    pub inventory_unit: String,
    pub opening_stock: i64,
    pub total_in: i64,
    pub total_out: i64,
    pub adjustment_quantity: i64,
    pub adjustment_value: i64,
    pub closing_stock: i64,
    pub average_cost: i64,
    pub stock_value: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentInventoryRowDTO {
    pub product_id: i64,
    pub product_code: String,
    pub product_name: String,
    pub animal_category: String,
    pub inventory_unit: String,
    pub current_stock: i64,
    pub average_cost: i64,
    pub current_inventory_value: i64,
    pub cost_data_status: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryDataHealth {
    pub is_healthy: bool,
    pub has_orphans: bool,
    pub orphan_details: Option<String>,
    pub critical_count: usize,
    pub warning_count: usize,
    pub issues: Vec<InventoryReconciliationIssue>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IntegritySeverity {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryReconciliationIssue {
    pub code: String,
    pub severity: IntegritySeverity,
    pub product_id: Option<i64>,
    pub product_code: Option<String>,
    pub product_name: Option<String>,
    pub stored_quantity: Option<i64>,
    pub calculated_quantity: Option<i64>,
    pub difference_quantity: Option<i64>,
    pub stored_value: Option<i64>,
    pub calculated_value: Option<i64>,
    pub opening_quantity: Option<i64>,
    pub purchased_quantity: Option<i64>,
    pub sold_quantity: Option<i64>,
    pub adjustment_quantity: Option<i64>,
    pub unit_cost: Option<i64>,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreValidationResult {
    pub can_commit: bool,
    pub critical_count: usize,
    pub warning_count: usize,
    pub issues: Vec<InventoryReconciliationIssue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodResponse<T> {
    pub rows: Vec<T>,
    pub resolved_date_from: String,
    pub resolved_date_to: String,
    pub data_source: String,
    pub data_coverage: String,
    pub message: Option<String>,
    pub has_revenue_data: bool,
    pub revenue_coverage: String,
    pub earliest_data_date: Option<String>,
    pub latest_data_date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportDataRange {
    pub earliest_data_date: Option<String>,
    pub latest_data_date: Option<String>,
}

// ============================================================
// Inventory & Dashboard Models
// ============================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryTransaction {
    pub id: i64,
    pub transaction_date: String,
    pub product_id: i64,
    pub product_code: Option<String>,
    pub product_name: Option<String>,
    pub transaction_type: String,
    pub source_type: String,
    pub source_id: i64,
    pub quantity_in: i64,
    pub quantity_out: i64,
    pub unit_cost: i64,
    pub stock_before: Option<i64>,
    pub stock_after: i64,
    pub old_average_cost: Option<i64>,
    pub new_average_cost: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardQueryParams {
    pub preset: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub group_by: Option<String>, // "day" | "week" | "month"
    pub compare_previous: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KpiMetric {
    pub current: i64,
    pub previous: Option<i64>,
    pub change_percent: Option<f64>,
    pub change_amount: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendChartPoint {
    pub period: String,
    pub purchase_total: i64,
    pub sales_total: i64,
    pub cost: i64,
    pub profit: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockAlertProduct {
    pub id: i64,
    pub product_code: String,
    pub product_name: String,
    pub current_stock: i64,
    pub min_threshold: i64,
    pub status: String, // "negative_stock" | "out_of_stock" | "low_stock"
    pub inventory_unit: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopProductItem {
    pub id: i64,
    pub product_code: String,
    pub product_name: String,
    pub total_quantity: i64,
    pub total_value: i64,
    pub share_percent: f64,
    pub inventory_unit: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardAnalyticsDTO {
    pub net_revenue: KpiMetric,
    pub cogs: KpiMetric,
    pub gross_profit: KpiMetric,
    pub purchase_value: KpiMetric,
    pub current_stock_value: i64,
    pub current_stock_quantity: i64,
    pub total_supplier_debt: i64,
    pub unpaid_invoices_count: i64,
    pub oldest_unpaid_invoice_date: Option<String>,
    pub purchase_count: i64,
    pub sales_count: i64,
    pub trend_series: Vec<TrendChartPoint>,
    pub negative_stock_count: i64,
    pub out_of_stock_count: i64,
    pub low_stock_count: i64,
    pub stock_alerts_preview: Vec<StockAlertProduct>,
    pub negative_stock_preview: Vec<StockAlertProduct>,
    pub out_of_stock_preview: Vec<StockAlertProduct>,
    pub low_stock_preview: Vec<StockAlertProduct>,
    pub all_stock_alerts_preview: Vec<StockAlertProduct>,
    pub top_selling: Vec<TopProductItem>,
    pub top_imported: Vec<TopProductItem>,
    pub recent_transactions: Vec<InventoryTransaction>,
    pub insights: Vec<String>,
    pub resolved_date_from: String,
    pub resolved_date_to: String,
    pub snapshot_as_of: String,
    pub data_source: String,
    pub data_coverage: String,
    pub message: Option<String>,
    pub revenue_coverage: String,
    pub inventory_opening_quantity: i64,
    pub inventory_opening_value: i64,
    pub inventory_in_quantity: i64,
    pub inventory_in_value: i64,
    pub inventory_out_quantity: i64,
    pub inventory_out_value: i64,
    pub inventory_closing_quantity: i64,
    pub inventory_closing_value: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyChartPoint {
    pub month: String,
    pub purchase_total: i64,
    pub sales_total: i64,
    pub cost: i64,
    pub profit: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductPriceHistoryPoint {
    pub date: String,
    pub effective_unit_cost: i64,
    pub quantity: i64,
    pub receipt_code: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub total_products: i64,
    pub total_stock: i64,
    pub total_stock_value: i64,
    pub total_supplier_debt: i64,
    pub monthly_purchase_total: i64,
    pub monthly_sales_total: i64,
    pub monthly_profit: i64,
    pub out_of_stock_products: Vec<Product>,
    pub recent_transactions: Vec<InventoryTransaction>,
    pub monthly_chart: Vec<MonthlyChartPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsDTO {
    pub store_name: String,
    pub tax_code: String,
    pub address: String,
    pub phone: String,
    pub currency: String,
    pub backup_folder: String,
    pub automatic_backup_enabled: bool,
    pub backup_retention_count: i64,
    pub last_successful_backup_date: String,
    pub last_backup_file: String,
    pub last_backup_error: String,
    #[serde(default)]
    pub preferred_supplier_ids: Vec<i64>,
    #[serde(default = "default_low_stock_threshold")]
    pub low_stock_threshold: i64,
}

fn default_low_stock_threshold() -> i64 {
    10
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupListItemDTO {
    pub file_name: String,
    pub file_path: String,
    pub created_at: String,
    pub backup_type: String,
    pub valid: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatusDTO {
    pub healthy: bool,
    pub folder_writable: bool,
    pub using_fallback: bool,
    pub preferred_folder_error: Option<String>,
    pub message: String,
    pub last_backup_date: String,
    pub last_backup_file: String,
    pub days_since_last_backup: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportParamsInput {
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub invoice_type: Option<String>, // "all" | "purchase" | "sale"
    pub status: Option<String>,
    pub search: Option<String>,
    pub sort_by: Option<String>,
    pub page: Option<usize>,
    pub page_size: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceSearchRowDTO {
    pub id: i64,
    pub invoice_type: String,
    pub document_code: String,
    pub invoice_number: Option<String>,
    pub invoice_date: String,
    pub partner_name: String,
    pub item_count: i64,
    pub grand_total: i64,
    pub payment_status: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevenueChartPointDTO {
    pub period: String,
    pub revenue: i64,
    pub cost: i64,
    pub profit: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevenueSummaryDTO {
    pub total_revenue: i64,
    pub total_cost: i64,
    pub total_profit: i64,
    pub invoice_count: i64,
    pub chart: Vec<RevenueChartPointDTO>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductSalesReportRowDTO {
    pub product_id: i64,
    pub product_code: String,
    pub product_name: String,
    pub animal_category: String,
    pub inventory_unit: String,
    pub quantity_sold: i64,
    pub revenue: i64,
    pub cost: i64,
    pub profit: i64,
    pub average_sale_price: i64,
    pub profit_margin: Option<f64>,
    pub invoice_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierDebtReportRowDTO {
    pub supplier_id: i64,
    pub company_name: String,
    pub tax_code: Option<String>,
    pub phone: Option<String>,
    pub confirmed_invoice_count: i64,
    pub total_purchased: i64,
    pub total_paid: i64,
    pub total_debt: i64,
    pub oldest_unpaid_invoice_date: Option<String>,
    pub last_payment_date: Option<String>,
    pub snapshot_consistent: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportExportReportRowDTO {
    pub product_id: i64,
    pub product_code: String,
    pub product_name: String,
    pub animal_category: String,
    pub inventory_unit: String,
    pub opening_stock: i64,
    pub opening_value: i64,
    pub total_purchase_qty: i64,
    pub purchase_value: i64,
    pub total_sale_qty: i64,
    pub sale_cost_value: i64,
    pub adjustment_quantity: i64,
    pub adjustment_value: i64,
    pub closing_stock: i64,
    pub closing_average_cost: i64,
    pub closing_value: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyInventorySummaryDTO {
    pub product_code: String,
    pub product_name: String,
    pub inventory_unit: String,
    pub period_label: String,
    pub opening_quantity: i64,
    pub opening_unit_cost: i64,
    pub opening_value: i64,
    pub purchase_quantity: i64,
    pub purchase_unit_cost: i64,
    pub purchase_value: i64,
    pub sale_quantity: i64,
    pub sale_unit_cost: i64,
    pub sale_value: i64,
    pub closing_quantity: i64,
    pub closing_unit_cost: i64,
    pub closing_value: i64,
    pub derived_closing_unit_cost: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryAdjustmentDTO {
    pub id: i64,
    pub product_id: i64,
    pub product_code: String,
    pub product_name: String,
    pub system_stock: i64,
    pub actual_stock: i64,
    pub difference: i64,
    pub reason: String,
    pub notes: Option<String>,
    pub adjustment_date: String,
    pub adjustment_unit_cost: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInventoryAdjustmentInput {
    pub product_id: i64,
    pub actual_stock: i64,
    pub reason: String,
    pub notes: Option<String>,
    pub adjustment_date: String,
    pub adjustment_unit_cost: Option<i64>,
}
