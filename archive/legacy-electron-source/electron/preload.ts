import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-types'
import type {
  IpcResult,
  PaginatedResult,
  ProductDTO,
  CreateProductInput,
  UpdateProductInput,
  ProductListParams,
  SupplierDTO,
  CreateSupplierInput,
  UpdateSupplierInput,
  SupplierListParams,
  PurchaseInvoiceDTO,
  CreatePurchaseInvoiceInput,
  UpdatePurchaseInvoiceInput,
  PurchaseListParams,
  SalesInvoiceDTO,
  CreateSalesInvoiceInput,
  UpdateSalesInvoiceInput,
  SalesListParams,
  InventoryTransactionDTO,
  InventorySummaryDTO,
  InventoryParams,
  SupplierPaymentDTO,
  CreateSupplierPaymentInput,
  AttachmentDTO,
  AppSettingsDTO,
  DashboardStats,
  BackupResult,
  RestoreResult,
  ImportValidationResult,
  ImportResult,
  ImportParseResult,
  ImportValidateRequest,
  ImportExecuteRequest,
  BackupInfo,
  ImportJobDTO,
  BackupStorageStats,
  ReportParams,
  ImportExportReportRow,
  SupplierDebtReportRow,
  RevenueSummary,
  ProductSalesReportRow,
  PriceHistoryReportRow,
  ReportExportRequest,
  ReportExportResult,
  InvoiceSearchRow,
} from '@shared/ipc-types'

// ============================================================
// Typed IPC invoker helper
// ============================================================
function invoke<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<T>>
}

// ============================================================
// The electronAPI object exposed to renderer via contextBridge
// Renderer cannot access Node.js or Electron APIs directly
// ============================================================
const electronAPI = {
  // ---- Products ----
  products: {
    list: (params?: ProductListParams) =>
      invoke<PaginatedResult<ProductDTO>>(IPC_CHANNELS.PRODUCT_LIST, params),
    get: (id: number) => invoke<ProductDTO>(IPC_CHANNELS.PRODUCT_GET, id),
    create: (input: CreateProductInput) =>
      invoke<ProductDTO>(IPC_CHANNELS.PRODUCT_CREATE, input),
    update: (input: UpdateProductInput) =>
      invoke<ProductDTO>(IPC_CHANNELS.PRODUCT_UPDATE, input),
    toggleActive: (id: number) =>
      invoke<ProductDTO>(IPC_CHANNELS.PRODUCT_TOGGLE_ACTIVE, id),
    delete: (id: number) => invoke<void>(IPC_CHANNELS.PRODUCT_DELETE, id),
    history: (id: number, params?: InventoryParams) =>
      invoke<InventoryTransactionDTO[]>(IPC_CHANNELS.PRODUCT_HISTORY, id, params),
    exportExcel: () => invoke<string>(IPC_CHANNELS.PRODUCT_EXPORT_EXCEL),
  },

  // ---- Suppliers ----
  suppliers: {
    list: (params?: SupplierListParams) =>
      invoke<PaginatedResult<SupplierDTO>>(IPC_CHANNELS.SUPPLIER_LIST, params),
    get: (id: number) => invoke<SupplierDTO>(IPC_CHANNELS.SUPPLIER_GET, id),
    create: (input: CreateSupplierInput) =>
      invoke<SupplierDTO>(IPC_CHANNELS.SUPPLIER_CREATE, input),
    update: (input: UpdateSupplierInput) =>
      invoke<SupplierDTO>(IPC_CHANNELS.SUPPLIER_UPDATE, input),
    toggleActive: (id: number) =>
      invoke<SupplierDTO>(IPC_CHANNELS.SUPPLIER_TOGGLE_ACTIVE, id),
    delete: (id: number) => invoke<void>(IPC_CHANNELS.SUPPLIER_DELETE, id),
    stats: (id: number) => invoke<SupplierDTO>(IPC_CHANNELS.SUPPLIER_STATS, id),
    invoices: (id: number, params?: PurchaseListParams) =>
      invoke<PaginatedResult<PurchaseInvoiceDTO>>(IPC_CHANNELS.SUPPLIER_INVOICES, id, params),
    payments: (id: number) =>
      invoke<SupplierPaymentDTO[]>(IPC_CHANNELS.SUPPLIER_PAYMENTS, id),
  },

  // ---- Purchase Invoices ----
  purchases: {
    list: (params?: PurchaseListParams) =>
      invoke<PaginatedResult<PurchaseInvoiceDTO>>(IPC_CHANNELS.PURCHASE_LIST, params),
    get: (id: number) => invoke<PurchaseInvoiceDTO>(IPC_CHANNELS.PURCHASE_GET, id),
    create: (input: CreatePurchaseInvoiceInput) =>
      invoke<PurchaseInvoiceDTO>(IPC_CHANNELS.PURCHASE_CREATE, input),
    update: (input: UpdatePurchaseInvoiceInput) =>
      invoke<PurchaseInvoiceDTO>(IPC_CHANNELS.PURCHASE_UPDATE, input),
    confirm: (id: number) => invoke<PurchaseInvoiceDTO>(IPC_CHANNELS.PURCHASE_CONFIRM, id),
    cancel: (id: number, reason?: string) =>
      invoke<PurchaseInvoiceDTO>(IPC_CHANNELS.PURCHASE_CANCEL, id, reason),
    delete: (id: number) => invoke<void>(IPC_CHANNELS.PURCHASE_DELETE, id),
    checkDuplicate: (supplierId: number, invoiceNumber: string, excludeId?: number) =>
      invoke<boolean>(IPC_CHANNELS.PURCHASE_CHECK_DUPLICATE, supplierId, invoiceNumber, excludeId),
  },

  // ---- Supplier Payments ----
  payments: {
    create: (input: CreateSupplierPaymentInput) =>
      invoke<SupplierPaymentDTO>(IPC_CHANNELS.PAYMENT_CREATE, input),
    list: (purchaseInvoiceId: number) =>
      invoke<SupplierPaymentDTO[]>(IPC_CHANNELS.PAYMENT_LIST, purchaseInvoiceId),
  },

  // ---- Sales Invoices ----
  sales: {
    list: (params?: SalesListParams) =>
      invoke<PaginatedResult<SalesInvoiceDTO>>(IPC_CHANNELS.SALE_LIST, params),
    get: (id: number) => invoke<SalesInvoiceDTO>(IPC_CHANNELS.SALE_GET, id),
    create: (input: CreateSalesInvoiceInput) =>
      invoke<SalesInvoiceDTO>(IPC_CHANNELS.SALE_CREATE, input),
    update: (input: UpdateSalesInvoiceInput) =>
      invoke<SalesInvoiceDTO>(IPC_CHANNELS.SALE_UPDATE, input),
    confirm: (id: number) => invoke<SalesInvoiceDTO>(IPC_CHANNELS.SALE_CONFIRM, id),
    cancel: (id: number, reason?: string) =>
      invoke<SalesInvoiceDTO>(IPC_CHANNELS.SALE_CANCEL, id, reason),
    delete: (id: number) => invoke<void>(IPC_CHANNELS.SALE_DELETE, id),
  },

  // ---- Inventory ----
  inventory: {
    summary: (params?: InventoryParams) =>
      invoke<InventorySummaryDTO[]>(IPC_CHANNELS.INVENTORY_SUMMARY, params),
    transactions: (params?: InventoryParams) =>
      invoke<PaginatedResult<InventoryTransactionDTO>>(
        IPC_CHANNELS.INVENTORY_TRANSACTIONS,
        params
      ),
    productHistory: (productId: number, params?: InventoryParams) =>
      invoke<InventoryTransactionDTO[]>(
        IPC_CHANNELS.INVENTORY_PRODUCT_HISTORY,
        productId,
        params
      ),
  },

  // ---- Attachments ----
  attachments: {
    save: (
      entityType: string,
      entityId: number,
      filePath: string
    ) => invoke<AttachmentDTO>(IPC_CHANNELS.ATTACHMENT_SAVE, entityType, entityId, filePath),
    list: (entityType: string, entityId: number) =>
      invoke<AttachmentDTO[]>(IPC_CHANNELS.ATTACHMENT_LIST, entityType, entityId),
    open: (id: number) => invoke<void>(IPC_CHANNELS.ATTACHMENT_OPEN, id),
    delete: (id: number) => invoke<void>(IPC_CHANNELS.ATTACHMENT_DELETE, id),
  },

  // ---- Reports ----
  reports: {
    importExport: (params: ReportParams) =>
      invoke<ImportExportReportRow[]>(IPC_CHANNELS.REPORT_IMPORT_EXPORT, params),
    revenue: (params: ReportParams) =>
      invoke<RevenueSummary>(IPC_CHANNELS.REPORT_REVENUE, params),
    supplierDebt: (params?: ReportParams) =>
      invoke<SupplierDebtReportRow[]>(IPC_CHANNELS.REPORT_SUPPLIER_DEBT, params),
    productSales: (params: ReportParams) =>
      invoke<ProductSalesReportRow[]>(IPC_CHANNELS.REPORT_PRODUCT_SALES, params),
    priceHistory: (params?: ReportParams) =>
      invoke<PriceHistoryReportRow[]>(IPC_CHANNELS.REPORT_PRICE_HISTORY, params),
    exportExcel: (request: ReportExportRequest) =>
      invoke<ReportExportResult>(IPC_CHANNELS.REPORT_EXPORT_EXCEL, request),
    invoiceSearch: (params: ReportParams) =>
      invoke<PaginatedResult<InvoiceSearchRow>>(IPC_CHANNELS.INVOICE_SEARCH, params),
  },

  // ---- Import ----
  import: {
    parseFile: (filePath: string) =>
      invoke<ImportParseResult>(IPC_CHANNELS.IMPORT_PARSE_FILE, filePath),
    validate: (request: ImportValidateRequest) =>
      invoke<ImportValidationResult>(IPC_CHANNELS.IMPORT_VALIDATE, request),
    execute: (request: ImportExecuteRequest) =>
      invoke<ImportResult>(IPC_CHANNELS.IMPORT_EXECUTE, request),
    cancel: (importSessionId: string) =>
      invoke<boolean>(IPC_CHANNELS.IMPORT_CANCEL, importSessionId),
    history: (limit?: number) =>
      invoke<ImportJobDTO[]>(IPC_CHANNELS.IMPORT_HISTORY, limit),
    exportErrors: (importSessionId: string, filePath: string) =>
      invoke<string>(IPC_CHANNELS.IMPORT_EXPORT_ERROR_REPORT, importSessionId, filePath),
  },

  // ---- Settings ----
  settings: {
    get: () => invoke<AppSettingsDTO>(IPC_CHANNELS.SETTINGS_GET),
    update: (settings: Partial<AppSettingsDTO>) =>
      invoke<AppSettingsDTO>(IPC_CHANNELS.SETTINGS_UPDATE, settings),
    chooseFolder: () => invoke<string | null>(IPC_CHANNELS.SETTINGS_CHOOSE_FOLDER),
  },

  // ---- Backup ----
  backup: {
    create: () => invoke<BackupResult>(IPC_CHANNELS.BACKUP_CREATE),
    restore: (zipPath: string) => invoke<RestoreResult>(IPC_CHANNELS.BACKUP_RESTORE, zipPath),
    list: () => invoke<BackupInfo[]>(IPC_CHANNELS.BACKUP_LIST),
    storageStats: () => invoke<BackupStorageStats>(IPC_CHANNELS.BACKUP_STORAGE_STATS),
    openFolder: () => invoke<void>(IPC_CHANNELS.BACKUP_OPEN_FOLDER),
  },

  // ---- Dashboard ----
  dashboard: {
    stats: () => invoke<DashboardStats>(IPC_CHANNELS.DASHBOARD_STATS),
  },

  // ---- App ----
  app: {
    version: () => invoke<string>(IPC_CHANNELS.APP_VERSION),
    openExternal: (url: string) => invoke<void>(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
  },

  // ---- File dialog (for selecting files in renderer) ----
  dialog: {
    openFile: (filters?: Electron.FileFilter[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, filters) as Promise<string | null>,
    openFolder: () =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FOLDER) as Promise<string | null>,
    saveFile: (defaultName?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SAVE_FILE, defaultName) as Promise<string | null>,
  },
}

// Expose the API to the renderer via contextBridge
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// TypeScript declaration for renderer usage
export type ElectronAPI = typeof electronAPI
