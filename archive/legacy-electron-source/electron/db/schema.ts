import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ============================================================
// products
// ============================================================
export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productCode: text('product_code').notNull().unique(),
    productName: text('product_name').notNull(),
    // heo | ga | vit | bo | de | khac
    animalCategory: text('animal_category').notNull(),
    // Trọng lượng quy cách (lưu theo gram để tránh float: 25000 = 25kg, 5000 = 5kg)
    packageWeightGrams: integer('package_weight_grams').notNull(),
    // kg | g
    packageWeightUnit: text('package_weight_unit').notNull().default('kg'),
    // Bao | Tui | Bich
    inventoryUnit: text('inventory_unit').notNull(),
    brand: text('brand'),
    // Giá lưu dưới dạng integer (VND đồng)
    latestPurchasePrice: integer('latest_purchase_price').notNull().default(0),
    averageCost: integer('average_cost').notNull().default(0),
    currentSalePrice: integer('current_sale_price').notNull().default(0),
    // Số lượng tồn kho (integer, không phải float)
    currentStock: integer('current_stock').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now','localtime'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now','localtime'))`),
  },
  (table) => ({
    productCodeIdx: uniqueIndex('products_product_code_idx').on(table.productCode),
    animalCategoryIdx: index('products_animal_category_idx').on(table.animalCategory),
    activeIdx: index('products_active_idx').on(table.active),
  })
)

// ============================================================
// suppliers
// ============================================================
export const suppliers = sqliteTable(
  'suppliers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyName: text('company_name').notNull(),
    phone: text('phone'),
    address: text('address'),
    taxCode: text('tax_code'),
    contactPerson: text('contact_person'),
    bankAccount: text('bank_account'),
    notes: text('notes'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now','localtime'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now','localtime'))`),
  },
  (table) => ({
    companyNameIdx: index('suppliers_company_name_idx').on(table.companyName),
  })
)

// ============================================================
// purchase_invoices (phiếu nhập)
// ============================================================
export const purchaseInvoices = sqliteTable(
  'purchase_invoices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    receiptCode: text('receipt_code').notNull().unique(), // PN000001
    // Số hóa đơn lưu dạng TEXT để giữ số 0 đầu
    invoiceNumber: text('invoice_number').notNull(),
    invoiceDate: text('invoice_date').notNull(), // ISO date string YYYY-MM-DD
    receivedDate: text('received_date').notNull(),
    supplierId: integer('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    // Tiền lưu dạng integer (VND đồng)
    subtotal: integer('subtotal').notNull().default(0),
    discountAmount: integer('discount_amount').notNull().default(0),
    taxAmount: integer('tax_amount').notNull().default(0),
    shippingCost: integer('shipping_cost').notNull().default(0),
    shippingAllocationMethod: text('shipping_allocation_method').notNull().default('quantity'),
    grandTotal: integer('grand_total').notNull().default(0),
    paidAmount: integer('paid_amount').notNull().default(0),
    remainingAmount: integer('remaining_amount').notNull().default(0),
    paymentStatus: text('payment_status').notNull().default('chua_thanh_toan'),
    // chuyen_khoan | tien_mat | khac
    paymentMethod: text('payment_method').notNull().default('chuyen_khoan'),
    // nhap | xac_nhan | huy
    status: text('status').notNull().default('nhap'),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now','localtime'))`),
    confirmedAt: text('confirmed_at'),
    cancelledAt: text('cancelled_at'),
  },
  (table) => ({
    supplierIdIdx: index('purchase_invoices_supplier_id_idx').on(table.supplierId),
    statusIdx: index('purchase_invoices_status_idx').on(table.status),
    invoiceDateIdx: index('purchase_invoices_invoice_date_idx').on(table.invoiceDate),
    receiptCodeIdx: uniqueIndex('purchase_invoices_receipt_code_idx').on(table.receiptCode),
  })
)

// ============================================================
// purchase_invoice_items
// ============================================================
export const purchaseInvoiceItems = sqliteTable(
  'purchase_invoice_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    purchaseInvoiceId: integer('purchase_invoice_id')
      .notNull()
      .references(() => purchaseInvoices.id),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull(),
    invoiceUnitPrice: integer('invoice_unit_price').notNull(),
    discountAmount: integer('discount_amount').notNull().default(0),
    shippingAllocation: integer('shipping_allocation').notNull().default(0),
    // Giá thực nhập = (đơn giá - chiết khấu) + phân bổ vận chuyển / số lượng
    effectiveUnitCost: integer('effective_unit_cost').notNull(),
    lineTotal: integer('line_total').notNull(),
    notes: text('notes'),
  },
  (table) => ({
    purchaseInvoiceIdIdx: index('purchase_invoice_items_invoice_id_idx').on(
      table.purchaseInvoiceId
    ),
    productIdIdx: index('purchase_invoice_items_product_id_idx').on(table.productId),
  })
)

// ============================================================
// supplier_payments (thanh toán công nợ nhà cung cấp)
// ============================================================
export const supplierPayments = sqliteTable(
  'supplier_payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    purchaseInvoiceId: integer('purchase_invoice_id')
      .notNull()
      .references(() => purchaseInvoices.id),
    paymentDate: text('payment_date').notNull(),
    amount: integer('amount').notNull(),
    paymentMethod: text('payment_method').notNull().default('chuyen_khoan'),
    transactionReference: text('transaction_reference'),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now','localtime'))`),
  },
  (table) => ({
    purchaseInvoiceIdIdx: index('supplier_payments_invoice_id_idx').on(table.purchaseInvoiceId),
    paymentDateIdx: index('supplier_payments_payment_date_idx').on(table.paymentDate),
  })
)

// ============================================================
// sales_invoices (phiếu xuất)
// ============================================================
export const salesInvoices = sqliteTable(
  'sales_invoices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    issueCode: text('issue_code').notNull().unique(), // PX000001
    // Số HĐ điện tử lưu dạng TEXT
    electronicInvoiceNumber: text('electronic_invoice_number'),
    invoiceDate: text('invoice_date').notNull(),
    // khach_le | dai_ly | trang_trai | khac
    buyerType: text('buyer_type').notNull().default('khach_le'),
    buyerName: text('buyer_name'),
    subtotal: integer('subtotal').notNull().default(0),
    grandTotal: integer('grand_total').notNull().default(0),
    totalCost: integer('total_cost').notNull().default(0),
    estimatedProfit: integer('estimated_profit').notNull().default(0),
    // nhap | xac_nhan | huy
    status: text('status').notNull().default('nhap'),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now','localtime'))`),
    confirmedAt: text('confirmed_at'),
    cancelledAt: text('cancelled_at'),
    cancellationReason: text('cancellation_reason'),
  },
  (table) => ({
    statusIdx: index('sales_invoices_status_idx').on(table.status),
    invoiceDateIdx: index('sales_invoices_invoice_date_idx').on(table.invoiceDate),
    issueCodeIdx: uniqueIndex('sales_invoices_issue_code_idx').on(table.issueCode),
  })
)

// ============================================================
// sales_invoice_items
// ============================================================
export const salesInvoiceItems = sqliteTable(
  'sales_invoice_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    salesInvoiceId: integer('sales_invoice_id')
      .notNull()
      .references(() => salesInvoices.id),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull(),
    unitSalePrice: integer('unit_sale_price').notNull(),
    // Giá vốn tại thời điểm xuất (snapshot)
    unitCostAtSale: integer('unit_cost_at_sale').notNull(),
    lineRevenue: integer('line_revenue').notNull(),
    lineCost: integer('line_cost').notNull(),
    estimatedProfit: integer('estimated_profit').notNull(),
  },
  (table) => ({
    salesInvoiceIdIdx: index('sales_invoice_items_invoice_id_idx').on(table.salesInvoiceId),
    productIdIdx: index('sales_invoice_items_product_id_idx').on(table.productId),
  })
)

// ============================================================
// inventory_transactions (lịch sử kho)
// ============================================================
export const inventoryTransactions = sqliteTable(
  'inventory_transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    transactionDate: text('transaction_date').notNull(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    // nhap | xuat | dieu_chinh | huy_nhap | huy_xuat
    transactionType: text('transaction_type').notNull(),
    // purchase_invoice | sales_invoice | adjustment
    sourceType: text('source_type').notNull(),
    sourceId: integer('source_id').notNull(),
    quantityIn: integer('quantity_in').notNull().default(0),
    quantityOut: integer('quantity_out').notNull().default(0),
    unitCost: integer('unit_cost').notNull().default(0),
    stockBefore: integer('stock_before'),
    stockAfter: integer('stock_after').notNull(),
    oldAverageCost: integer('old_average_cost'),
    newAverageCost: integer('new_average_cost'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now','localtime'))`),
  },
  (table) => ({
    productIdIdx: index('inventory_transactions_product_id_idx').on(table.productId),
    transactionDateIdx: index('inventory_transactions_date_idx').on(table.transactionDate),
    sourceIdx: index('inventory_transactions_source_idx').on(
      table.sourceType,
      table.sourceId
    ),
  })
)

// ============================================================
// product_price_history
// ============================================================
export const productPriceHistory = sqliteTable(
  'product_price_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    // sale_price | average_cost | purchase_price
    priceType: text('price_type').notNull().default('sale_price'),
    oldPrice: integer('old_price').notNull(),
    newPrice: integer('new_price').notNull(),
    changedAt: text('changed_at')
      .notNull()
      .default(sql`(datetime('now','localtime'))`),
    reason: text('reason'),
  },
  (table) => ({
    productIdIdx: index('product_price_history_product_id_idx').on(table.productId),
    changedAtIdx: index('product_price_history_changed_at_idx').on(table.changedAt),
  })
)

// ============================================================
// attachments (file đính kèm hóa đơn)
// ============================================================
export const attachments = sqliteTable(
  'attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // purchase_invoice | sales_invoice
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    originalFilename: text('original_filename').notNull(),
    storedFilename: text('stored_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    // Lưu relative path, không lưu blob
    relativePath: text('relative_path').notNull(),
    fileSize: integer('file_size').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now','localtime'))`),
  },
  (table) => ({
    entityIdx: index('attachments_entity_idx').on(table.entityType, table.entityId),
  })
)

// ============================================================
// app_settings
// ============================================================
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now','localtime'))`),
})

// ============================================================
// schema_migrations (version tracking)
// ============================================================
export const schemaMigrations = sqliteTable('schema_migrations', {
  version: integer('version').primaryKey(),
  appliedAt: text('applied_at')
    .notNull()
    .default(sql`(datetime('now','localtime'))`),
})

export const appCounters = sqliteTable('app_counters', {
  name: text('name').primaryKey(),
  value: integer('value').notNull().default(0),
})

export const importJobs = sqliteTable('import_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  importType: text('import_type').notNull(),
  sourceFilename: text('source_filename').notNull(),
  sourceFileHash: text('source_file_hash').notNull(),
  sheetName: text('sheet_name').notNull(),
  mode: text('mode').notNull(),
  totalRows: integer('total_rows').notNull().default(0),
  importedRows: integer('imported_rows').notNull().default(0),
  warningRows: integer('warning_rows').notNull().default(0),
  errorRows: integer('error_rows').notNull().default(0),
  status: text('status').notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  errorSummary: text('error_summary'),
  optionsJson: text('options_json').notNull().default('{}'),
})

export const importJobErrors = sqliteTable('import_job_errors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  importJobId: integer('import_job_id').notNull().references(() => importJobs.id),
  rowNumber: integer('row_number').notNull(),
  columnName: text('column_name').notNull(),
  code: text('code').notNull(),
  message: text('message').notNull(),
  originalValue: text('original_value'),
  severity: text('severity').notNull(),
})

export const legacyInventorySummaries = sqliteTable(
  'legacy_inventory_summaries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    importJobId: integer('import_job_id').notNull().references(() => importJobs.id),
    productId: integer('product_id').references(() => products.id),
    periodLabel: text('period_label').notNull(),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    openingQuantity: integer('opening_quantity').notNull().default(0),
    openingUnitCost: integer('opening_unit_cost').notNull().default(0),
    openingValue: integer('opening_value').notNull().default(0),
    purchaseQuantity: integer('purchase_quantity').notNull().default(0),
    purchaseUnitCost: integer('purchase_unit_cost').notNull().default(0),
    purchaseValue: integer('purchase_value').notNull().default(0),
    saleQuantity: integer('sale_quantity').notNull().default(0),
    saleUnitCost: integer('sale_unit_cost').notNull().default(0),
    saleValue: integer('sale_value').notNull().default(0),
    closingQuantity: integer('closing_quantity').notNull().default(0),
    closingUnitCost: integer('closing_unit_cost').notNull().default(0),
    closingValue: integer('closing_value').notNull().default(0),
    sourceRowNumber: integer('source_row_number').notNull(),
    warningsJson: text('warnings_json').notNull().default('[]'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now','localtime'))`),
  },
  (table) => ({
    importJobIdIdx: index('legacy_inventory_summaries_job_idx').on(table.importJobId),
    productIdIdx: index('legacy_inventory_summaries_product_idx').on(table.productId),
    periodIdx: index('legacy_inventory_summaries_period_idx').on(table.periodEnd),
  })
)

// Export all table types for Drizzle inference
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type Supplier = typeof suppliers.$inferSelect
export type NewSupplier = typeof suppliers.$inferInsert
export type PurchaseInvoice = typeof purchaseInvoices.$inferSelect
export type NewPurchaseInvoice = typeof purchaseInvoices.$inferInsert
export type PurchaseInvoiceItem = typeof purchaseInvoiceItems.$inferSelect
export type NewPurchaseInvoiceItem = typeof purchaseInvoiceItems.$inferInsert
export type SupplierPayment = typeof supplierPayments.$inferSelect
export type NewSupplierPayment = typeof supplierPayments.$inferInsert
export type SalesInvoice = typeof salesInvoices.$inferSelect
export type NewSalesInvoice = typeof salesInvoices.$inferInsert
export type SalesInvoiceItem = typeof salesInvoiceItems.$inferSelect
export type NewSalesInvoiceItem = typeof salesInvoiceItems.$inferInsert
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect
export type NewInventoryTransaction = typeof inventoryTransactions.$inferInsert
export type ProductPriceHistory = typeof productPriceHistory.$inferSelect
export type NewProductPriceHistory = typeof productPriceHistory.$inferInsert
export type Attachment = typeof attachments.$inferSelect
export type NewAttachment = typeof attachments.$inferInsert
export type AppSetting = typeof appSettings.$inferSelect
export type LegacyInventorySummary = typeof legacyInventorySummaries.$inferSelect
export type NewLegacyInventorySummary = typeof legacyInventorySummaries.$inferInsert

// Re-export real for compatibility (used for package_weight_grams display)
export { real }
