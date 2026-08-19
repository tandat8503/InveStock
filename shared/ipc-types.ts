/**
 * Typed IPC contracts shared between main process and renderer.
 * All communication between renderer and main MUST go through these typed channels.
 */

// ============================================================
// Common types
// ============================================================
export interface IpcResult<T> {
  success: boolean
  data?: T
  error?: string
}

export interface PaginationParams {
  page: number
  pageSize: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// ============================================================
// Product types
// ============================================================
export type AnimalCategory = 'heo' | 'ga' | 'vit' | 'bo' | 'de' | 'khac'
export type InventoryUnit = 'Bao' | 'Tui' | 'Bich'
export type ProductStatus = 'active' | 'inactive'

export interface ProductDTO {
  id: number
  productCode: string
  productName: string
  animalCategory: AnimalCategory
  packageWeightGrams: number
  packageWeightUnit: string
  packageWeightKnown: boolean
  inventoryUnit: InventoryUnit
  brand: string | null
  latestPurchasePrice: number
  latestPurchasePriceKnown: boolean
  averageCost: number
  /** @deprecated Giá bán được nhập trên phiếu xuất; trường này chỉ giữ để tương thích dữ liệu cũ. */
  currentSalePrice: number
  currentStock: number
  currentInventoryValue: number
  active: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateProductInput {
  productCode: string
  productName: string
  animalCategory: AnimalCategory
  packageWeightGrams: number
  packageWeightUnit?: 'kg' | 'g'
  inventoryUnit: InventoryUnit
  brand?: string
  active: boolean
  notes?: string
}

export interface UpdateProductInput extends Partial<Omit<CreateProductInput, 'active'>> {
  id: number
}

export interface ProductListParams {
  search?: string
  animalCategory?: AnimalCategory
  inventoryUnit?: InventoryUnit
  activeOnly?: boolean
  page?: number
  pageSize?: number
}

// ============================================================
// Supplier types
// ============================================================
export interface SupplierDTO {
  id: number
  supplierCode?: string
  companyName: string
  phone: string | null
  address: string | null
  taxCode: string | null
  contactPerson: string | null
  bankAccount: string | null
  notes: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  // Computed fields
  totalPurchased?: number
  totalPaid?: number
  totalDebt?: number
}

export interface SupplierStatsDTO {
  supplierId: number
  totalPurchased: number
  totalPaid: number
  totalDebt: number
  confirmedInvoiceCount: number
  unpaidInvoiceCount: number
  lastPaymentDate: string | null
}

export interface CreateSupplierInput {
  companyName: string
  phone?: string
  address?: string
  taxCode?: string
  contactPerson?: string
  bankAccount?: string
  notes?: string
}

export interface UpdateSupplierInput extends Partial<CreateSupplierInput> {
  id: number
}

export interface SupplierListParams {
  search?: string
  activeOnly?: boolean
  page?: number
  pageSize?: number
}

// ============================================================
// Purchase Invoice types
// ============================================================
export type InvoiceStatus = 'nhap' | 'xac_nhan' | 'huy'
export type PaymentMethod = 'chuyen_khoan' | 'tien_mat' | 'khac'
export type ShippingAllocationMethod = 'quantity' | 'value' | 'manual'
export type PurchasePaymentStatus =
  | 'chua_thanh_toan'
  | 'thanh_toan_mot_phan'
  | 'da_thanh_toan'

export interface PurchaseInvoiceItemInput {
  productId: number
  quantity: number
  lineTotal: number
  notes?: string
}

export interface PurchaseInvoiceItemDTO {
  id: number
  purchaseInvoiceId: number
  productId: number
  productCode: string
  productName: string
  inventoryUnit: string
  quantity: number
  invoiceUnitPrice: number
  discountAmount: number
  shippingAllocation: number
  effectiveUnitCost: number
  inventoryCostValue: number
  lineTotal: number
  notes: string | null
}

export interface CreatePurchaseInvoiceInput {
  invoiceNumber: string
  invoiceDate: string
  receivedDate: string
  supplierId: number
  notes?: string
  items: PurchaseInvoiceItemInput[]
}

export interface UpdatePurchaseInvoiceInput {
  id: number
  invoiceNumber?: string
  invoiceDate?: string
  receivedDate?: string
  supplierId?: number
  notes?: string
  items?: PurchaseInvoiceItemInput[]
}

export interface PurchaseInvoiceDTO {
  id: number
  receiptCode: string
  invoiceNumber: string
  invoiceDate: string
  receivedDate: string
  supplierId: number
  supplierName: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  shippingCost: number
  shippingAllocationMethod: ShippingAllocationMethod
  grandTotal: number
  paidAmount: number
  remainingAmount: number
  paymentStatus: PurchasePaymentStatus
  paymentMethod: PaymentMethod
  status: InvoiceStatus
  notes: string | null
  createdAt: string
  confirmedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  items: PurchaseInvoiceItemDTO[]
}

export interface PurchaseListParams {
  search?: string
  supplierId?: number
  status?: InvoiceStatus
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

// ============================================================
// Sales Invoice types
// ============================================================
export type BuyerType = 'khach_le' | 'dai_ly' | 'trang_trai' | 'khac'

export interface SalesInvoiceItemInput {
  productId: number
  quantity: number
  lineTotalSale: number
}

export interface SalesInvoiceItemDTO {
  id: number
  salesInvoiceId: number
  productId: number
  productCode: string
  productName: string
  inventoryUnit: string
  currentStock: number
  quantity: number
  unitSalePrice: number
  unitCostAtSale: number
  lineRevenue: number
  lineCost: number
  estimatedProfit: number
}

export interface CreateSalesInvoiceInput {
  electronicInvoiceNumber?: string
  invoiceDate: string
  buyerType: BuyerType
  buyerName?: string
  notes?: string
  items: SalesInvoiceItemInput[]
}

export interface UpdateSalesInvoiceInput {
  id: number
  electronicInvoiceNumber?: string
  invoiceDate?: string
  buyerType?: BuyerType
  buyerName?: string
  notes?: string
  items?: SalesInvoiceItemInput[]
}

export interface SalesInvoiceDTO {
  id: number
  issueCode: string
  electronicInvoiceNumber: string | null
  invoiceDate: string
  buyerType: BuyerType
  buyerName: string | null
  subtotal: number
  grandTotal: number
  totalCost: number
  estimatedProfit: number
  status: InvoiceStatus
  notes: string | null
  createdAt: string
  confirmedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  items: SalesInvoiceItemDTO[]
}

export interface SalesListParams {
  search?: string
  buyerType?: BuyerType
  status?: InvoiceStatus
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

// ============================================================
// Inventory types
// ============================================================
export interface InventoryTransactionDTO {
  id: number
  transactionDate: string
  productId: number
  productCode: string
  productName: string
  transactionType: string
  sourceType: string
  sourceId: number
  quantityIn: number
  quantityOut: number
  unitCost: number
  stockBefore: number | null
  stockAfter: number
  createdAt: string
}

export interface InventorySummaryDTO {
  productId: number
  productCode: string
  productName: string
  animalCategory: AnimalCategory
  inventoryUnit: string
  openingStock: number
  totalIn: number
  totalOut: number
  adjustmentQuantity: number
  adjustmentValue: number
  closingStock: number
  averageCost: number
  stockValue: number
}

export interface CurrentInventoryRowDTO {
  productId: number
  productCode: string
  productName: string
  animalCategory: AnimalCategory
  inventoryUnit: string
  currentStock: number
  averageCost: number
  currentInventoryValue: number
  costDataStatus: 'known' | 'missing' | 'inconsistent'
  active: boolean
}

export interface InventoryDataHealth {
  isHealthy: boolean
  hasOrphans: boolean
  orphanDetails: string | null
  criticalCount: number
  warningCount: number
  issues: InventoryReconciliationIssue[]
}

export type IntegritySeverity = 'info' | 'warning' | 'critical'

export interface InventoryReconciliationIssue {
  code: string
  severity: IntegritySeverity
  productId?: number
  productCode?: string
  productName?: string
  storedQuantity?: number
  calculatedQuantity?: number
  differenceQuantity?: number
  storedValue?: number
  calculatedValue?: number
  openingQuantity?: number
  purchasedQuantity?: number
  soldQuantity?: number
  adjustmentQuantity?: number
  unitCost?: number
  explanation: string
}

export interface InventoryParams {
  dateFrom?: string
  dateTo?: string
  productId?: number
  search?: string
  page?: number
  pageSize?: number
}

// ============================================================
// Supplier Payment types
// ============================================================
export interface SupplierPaymentDTO {
  id: number
  purchaseInvoiceId: number
  receiptCode: string
  invoiceNumber: string
  paymentDate: string
  amount: number
  paymentMethod: PaymentMethod
  transactionReference: string | null
  notes: string | null
  createdAt: string
  status: string
  voidedAt: string | null
  voidReason: string | null
}

export interface CreateSupplierPaymentInput {
  purchaseInvoiceId: number
  paymentDate: string
  amount: number
  paymentMethod: PaymentMethod
  transactionReference?: string
  notes?: string
}

// ============================================================
// Attachment types
// ============================================================
export interface AttachmentDTO {
  id: number
  entityType: string
  entityId: number
  originalFilename: string
  storedFilename: string
  mimeType: string
  relativePath: string
  fileSize: number
  createdAt: string
}

// ============================================================
// Report types
// ============================================================
export interface ReportParams {
  dateFrom: string
  dateTo: string
  page?: number
  pageSize?: number
  invoiceType?: 'purchase' | 'sale' | 'all'
  status?: InvoiceStatus
  search?: string
  sortBy?: string
}

export interface ImportExportReportRow {
  productId: number
  productCode: string
  productName: string
  animalCategory: AnimalCategory
  inventoryUnit: string
  openingStock: number
  openingValue: number
  totalPurchaseQty: number
  purchaseValue: number
  totalSaleQty: number
  saleCostValue: number
  adjustmentQuantity: number
  adjustmentValue: number
  closingStock: number
  closingAverageCost: number
  closingValue: number
}

export type PeriodDataSource = 'legacy' | 'operational' | 'mixed'
export type PeriodDataCoverage = 'complete' | 'incomplete' | 'summary_only'

export interface PeriodResponse<T> {
  rows: T[]
  resolvedDateFrom: string
  resolvedDateTo: string
  dataSource: PeriodDataSource
  dataCoverage: PeriodDataCoverage
  message?: string | null
  hasRevenueData: boolean
  revenueCoverage: 'complete' | 'partial' | 'unavailable'
  earliestDataDate?: string | null
  latestDataDate?: string | null
}

export interface ReportDataRange {
  earliestDataDate?: string | null
  latestDataDate?: string | null
}

export interface LegacyInventorySummary {
  productCode: string
  productName: string
  inventoryUnit: string
  periodLabel: string
  openingQuantity: number
  openingUnitCost: number
  openingValue: number
  purchaseQuantity: number
  purchaseUnitCost: number
  purchaseValue: number
  saleQuantity: number
  saleUnitCost: number
  saleValue: number
  closingQuantity: number
  closingUnitCost: number
  closingValue: number
  derivedClosingUnitCost: boolean
}

export interface RevenueReportRow {
  invoiceDate: string
  issueCode: string
  electronicInvoiceNumber: string | null
  buyerType: BuyerType
  buyerName: string | null
  revenue: number
  cost: number
  profit: number
  profitMargin: number | null
}

export interface RevenueSummary {
  totalRevenue: number
  totalCost: number
  totalProfit: number
  averageMargin: number | null
  invoiceCount: number
  totalItemsSold: number
  grouping: 'day' | 'month'
  chart: { period: string; revenue: number; cost: number; profit: number }[]
  rows: RevenueReportRow[]
}

export interface ProductSalesReportRow {
  productId: number
  productCode: string
  productName: string
  animalCategory: AnimalCategory
  inventoryUnit: string
  quantitySold: number
  revenue: number
  cost: number
  profit: number
  averageSalePrice: number
  profitMargin: number | null
  invoiceCount: number
}

export interface SupplierDebtReportRow {
  supplierId: number
  companyName: string
  taxCode: string | null
  phone: string | null
  confirmedInvoiceCount: number
  totalPurchased: number
  totalPaid: number
  totalDebt: number
  oldestUnpaidInvoiceDate: string | null
  lastPaymentDate: string | null
  snapshotConsistent: boolean
}

export interface PriceHistoryReportRow {
  productId: number
  productCode: string
  productName: string
  oldPrice: number
  newPrice: number
  difference: number
  changePercent: number | null
  changedAt: string
  reason: string | null
}

export interface InvoiceSearchRow {
  id: number
  invoiceType: 'purchase' | 'sale'
  documentCode: string
  invoiceNumber: string | null
  invoiceDate: string
  partnerName: string
  itemCount: number
  grandTotal: number
  paymentStatus: PurchasePaymentStatus | null
  status: InvoiceStatus
}

export type ReportPaginationResult<T> = PaginatedResult<T>

export interface ReportExportRequest {
  reportType: 'import_export' | 'revenue' | 'product_sales' | 'supplier_debt' | 'price_history'
  filters: ReportParams
}

export interface ReportExportResult {
  saved: boolean
  cancelled: boolean
  filePath?: string
}

// ============================================================
// Import types
// ============================================================
export interface ImportSheetPreview {
  sheetName: string
  headers: string[]
  rows: (string | number | null)[][]
  totalRows: number
  columnCount: number
  detectedHeaderRow: number
  warnings: string[]
  detectedProfile?: 'nxtgui' | 'generic'
  proposedPeriodLabel?: string
  proposedPeriodStart?: string
  proposedPeriodEnd?: string
  proposedSnapshotDate?: string
}

export type ImportType = 'products' | 'opening_inventory' | 'purchase_invoices' | 'sales_invoices' | 'nxtgui_inventory_summary'
export type ImportMode = 'import_as_draft' | 'import_as_confirmed' | 'reconcile_only' | 'initialize_closing_stock'
export type ImportTransactionMode = 'all_or_nothing' | 'per_invoice'
export interface ImportParseResult {
  importSessionId: string
  fileName: string
  fileHash: string
  duplicateFile: boolean
  sheets: ImportSheetPreview[]
}
export interface ImportMapping { sourceColumn: string; targetField: string }
export interface ImportValidateRequest {
  importSessionId: string
  sheetName: string
  importType: ImportType
  headerRow: number
  mappings: ImportMapping[]
  options?: {
    allowNegativeStock?: boolean
    allowNegativeLegacyStock?: boolean
    existingProduct?: 'skip' | 'update_non_financial_fields' | 'error'
    defaultSupplierId?: number
    mode?: ImportMode
    transactionMode?: ImportTransactionMode
    snapshotDate?: string
    proposedPeriodLabel?: string
    proposedPeriodStart?: string
    proposedPeriodEnd?: string
  }
}
export interface ImportExecuteRequest { importSessionId: string }

export interface ImportColumnMapping {
  sourceColumn: string
  targetField: string
}

export interface ImportValidationError {
  rowNumber: number
  column: string
  code: string
  message: string
  originalValue?: unknown
  normalizedValue?: unknown
  severity: 'error'
}

export interface ImportValidationWarning {
  rowNumber: number
  column: string
  code: string
  message: string
  originalValue?: unknown
  normalizedValue?: unknown
  severity: 'warning'
}

export interface ImportValidationResult {
  importSessionId: string
  totalRows: number
  validRows: number
  warningRows: number
  errorRows: number
  ignoredRows: number
  groupedDocuments: number
  errors: ImportValidationError[]
  warnings: ImportValidationWarning[]
  normalizedPreview: Record<string, string | number | null>[]
  canExecute: boolean
  detectedDuplicates: string[]
  missingProducts: string[]
  createdProductsPlan: string[]
  summary: string
}

export interface ImportResult {
  success: boolean
  importedCount: number
  skippedCount: number
  importJobId: number
  errors: ImportValidationError[]
  warnings: ImportValidationWarning[]
}

export interface ImportJobDTO {
  id: number
  importType: ImportType
  sourceFilename: string
  sourceFileHash: string
  sheetName: string
  mode: string
  totalRows: number
  importedRows: number
  warningRows: number
  errorRows: number
  status: string
  startedAt: string
  completedAt: string | null
  errorSummary: string | null
}

// ============================================================
// Settings types
// ============================================================
export interface AppSettingsDTO {
  storeName: string
  taxCode: string
  address: string
  phone: string
  currency: string
  backupFolder: string
  automaticBackupEnabled: boolean
  backupRetentionCount: number
  lastSuccessfulBackupDate: string
  lastBackupFile: string
  lastBackupError: string
  preferredSupplierIds: number[]
  lowStockThreshold: number
}

export interface BackupListItemDTO {
  fileName: string
  filePath: string
  createdAt: string
  backupType: string
  valid: boolean
}

export interface BackupStatusDTO {
  healthy: boolean
  folderWritable: boolean
  usingFallback: boolean
  preferredFolderError?: string
  message: string
  lastBackupDate: string
  lastBackupFile: string
  daysSinceLastBackup: number | null
}

// ============================================================
// Backup types
// ============================================================
export interface BackupResult {
  success: boolean
  filePath?: string
  error?: string
  fileSize?: number
  createdAt: string
  databaseHash?: string
  attachmentCount?: number
}

export interface RestoreResult {
  success: boolean
  error?: string
  restartRequired?: boolean
  warnings?: string[]
  preRestoreBackupPath?: string
}

export interface BackupInfo {
  fileName: string
  filePath: string
  fileSize: number
  createdAt: string
  formatVersion: number
  appVersion: string
  schemaVersion: number
  valid: boolean
  validationError?: string
  databaseHash?: string
}

export interface BackupStorageStats {
  databaseSize: number
  attachmentsSize: number
  backupFolderWritable: boolean
}

// ============================================================
// Dashboard types
// ============================================================
export interface MonthlyChartPoint {
  month: string
  purchaseTotal: number
  salesTotal: number
  cost: number
  profit: number
}

export interface ProductPriceHistoryPoint {
  date: string
  effectiveUnitCost: number
  quantity: number
  receiptCode: string
}

export interface DatabaseStatsDTO {
  productCount: number
  supplierCount: number
  purchaseCount: number
  salesCount: number
  transactionCount: number
  isEmpty: boolean
}

export interface SeedResultDTO {
  success: boolean
  message: string
  productsSeeded: number
  suppliersSeeded: number
  purchasesSeeded: number
  salesSeeded: number
}

export type DatePreset =
  | 'today'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_12_months'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'custom'

export type GroupByPeriod = 'day' | 'week' | 'month'

export interface DashboardQueryParams {
  preset?: DatePreset
  dateFrom?: string
  dateTo?: string
  groupBy?: GroupByPeriod
  comparePrevious?: boolean
}

export interface KpiMetricDTO {
  current: number
  previous: number | null
  changePercent: number | null
  changeAmount: number | null
}

export interface TrendChartPointDTO {
  period: string
  purchaseTotal: number
  salesTotal: number
  cost: number
  profit: number
}

export interface StockAlertProductDTO {
  id: number
  productCode: string
  productName: string
  currentStock: number
  minThreshold: number
  status: 'negative_stock' | 'out_of_stock' | 'low_stock'
  inventoryUnit: string
}

export interface TopProductItemDTO {
  id: number
  productCode: string
  productName: string
  totalQuantity: number
  totalValue: number
  sharePercent: number
  inventoryUnit: string
}

export interface DashboardAnalyticsDTO {
  netRevenue: KpiMetricDTO
  cogs: KpiMetricDTO
  grossProfit: KpiMetricDTO
  purchaseValue: KpiMetricDTO
  currentStockValue: number
  currentStockQuantity: number
  totalSupplierDebt: number
  unpaidInvoicesCount: number
  oldestUnpaidInvoiceDate: string | null
  purchaseCount: number
  salesCount: number
  trendSeries: TrendChartPointDTO[]
  negativeStockCount: number
  outOfStockCount: number
  lowStockCount: number
  stockAlertsPreview: StockAlertProductDTO[]
  negativeStockPreview: StockAlertProductDTO[]
  outOfStockPreview: StockAlertProductDTO[]
  lowStockPreview: StockAlertProductDTO[]
  allStockAlertsPreview: StockAlertProductDTO[]
  topSelling: TopProductItemDTO[]
  topImported: TopProductItemDTO[]
  recentTransactions: InventoryTransactionDTO[]
  insights: string[]
  resolvedDateFrom: string
  resolvedDateTo: string
  snapshotAsOf: string
  dataSource: PeriodDataSource
  dataCoverage: PeriodDataCoverage
  message?: string | null
  revenueCoverage: 'complete' | 'partial' | 'unavailable'
  inventoryOpeningQuantity: number
  inventoryOpeningValue: number
  inventoryInQuantity: number
  inventoryInValue: number
  inventoryOutQuantity: number
  inventoryOutValue: number
  inventoryClosingQuantity: number
  inventoryClosingValue: number
}

// ============================================================
// IPC Channel definitions
// ============================================================
export const IPC_CHANNELS = {
  // Products
  PRODUCT_LIST: 'product:list',
  PRODUCT_GET: 'product:get',
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_TOGGLE_ACTIVE: 'product:toggleActive',
  PRODUCT_DELETE: 'product:delete',
  PRODUCT_HISTORY: 'product:history',
  PRODUCT_EXPORT_EXCEL: 'product:exportExcel',

  // Suppliers
  SUPPLIER_LIST: 'supplier:list',
  SUPPLIER_GET: 'supplier:get',
  SUPPLIER_CREATE: 'supplier:create',
  SUPPLIER_UPDATE: 'supplier:update',
  SUPPLIER_TOGGLE_ACTIVE: 'supplier:toggleActive',
  SUPPLIER_DELETE: 'supplier:delete',
  SUPPLIER_STATS: 'supplier:stats',
  SUPPLIER_INVOICES: 'supplier:invoices',
  SUPPLIER_PAYMENTS: 'supplier:payments',

  // Purchase Invoices
  PURCHASE_LIST: 'purchase:list',
  PURCHASE_GET: 'purchase:get',
  PURCHASE_CREATE: 'purchase:create',
  PURCHASE_UPDATE: 'purchase:update',
  PURCHASE_CONFIRM: 'purchase:confirm',
  PURCHASE_CANCEL: 'purchase:cancel',
  PURCHASE_DELETE: 'purchase:delete',
  PURCHASE_CHECK_DUPLICATE: 'purchase:checkDuplicate',

  // Supplier Payments
  PAYMENT_CREATE: 'payment:create',
  PAYMENT_LIST: 'payment:list',

  // Sales Invoices
  SALE_LIST: 'sale:list',
  SALE_GET: 'sale:get',
  SALE_CREATE: 'sale:create',
  SALE_UPDATE: 'sale:update',
  SALE_CONFIRM: 'sale:confirm',
  SALE_CANCEL: 'sale:cancel',
  SALE_DELETE: 'sale:delete',

  // Inventory
  INVENTORY_SUMMARY: 'inventory:summary',
  INVENTORY_TRANSACTIONS: 'inventory:transactions',
  INVENTORY_PRODUCT_HISTORY: 'inventory:productHistory',

  // Attachments
  ATTACHMENT_SAVE: 'attachment:save',
  ATTACHMENT_LIST: 'attachment:list',
  ATTACHMENT_OPEN: 'attachment:open',
  ATTACHMENT_DELETE: 'attachment:delete',
  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
  DIALOG_SAVE_FILE: 'dialog:saveFile',

  // Reports
  REPORT_IMPORT_EXPORT: 'report:importExport',
  REPORT_REVENUE: 'report:revenue',
  REPORT_SUPPLIER_DEBT: 'report:supplierDebt',
  REPORT_PRODUCT_SALES: 'report:productSales',
  REPORT_PRICE_HISTORY: 'report:priceHistory',
  REPORT_EXPORT_EXCEL: 'report:exportExcel',
  INVOICE_SEARCH: 'invoice:search',

  // Import
  IMPORT_PARSE_FILE: 'import:parseFile',
  IMPORT_VALIDATE: 'import:validate',
  IMPORT_EXECUTE: 'import:execute',
  IMPORT_CANCEL: 'import:cancel',
  IMPORT_HISTORY: 'import:history',
  IMPORT_EXPORT_ERROR_REPORT: 'import:exportErrorReport',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_CHOOSE_FOLDER: 'settings:chooseFolder',

  // Backup
  BACKUP_CREATE: 'backup:create',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_LIST: 'backup:list',
  BACKUP_STORAGE_STATS: 'backup:storageStats',
  BACKUP_OPEN_FOLDER: 'backup:openFolder',

  // Dashboard
  DASHBOARD_STATS: 'dashboard:stats',

  // App
  APP_VERSION: 'app:version',
  APP_OPEN_EXTERNAL: 'app:openExternal',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

export interface InventoryAdjustmentDTO {
  id: number
  productId: number
  productCode: string
  productName: string
  systemStock: number
  actualStock: number
  difference: number
  reason: string
  notes: string | null
  adjustmentDate: string
  adjustmentUnitCost: number | null
  createdAt: string
}

export interface CreateInventoryAdjustmentInput {
  productId: number
  actualStock: number
  reason: string
  notes?: string
  adjustmentDate: string
  adjustmentUnitCost?: number
}
