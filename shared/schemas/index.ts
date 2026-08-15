import { z } from 'zod'
import type { AnimalCategory, InventoryUnit, PaymentMethod, BuyerType } from '../ipc-types'

// ============================================================
// Product schemas
// ============================================================
export const animalCategorySchema = z.enum(['heo', 'ga', 'vit', 'bo', 'de', 'khac'])
export const inventoryUnitSchema = z.enum(['Bao', 'Tui', 'Bich'])
export const paymentMethodSchema = z.enum(['chuyen_khoan', 'tien_mat', 'khac'])
export const buyerTypeSchema = z.enum(['khach_le', 'dai_ly', 'trang_trai', 'khac'])
export const invoiceStatusSchema = z.enum(['nhap', 'xac_nhan', 'huy'])

export const createProductSchema = z.object({
  productCode: z
    .string()
    .min(1, 'Mã sản phẩm không được để trống')
    .max(50, 'Mã sản phẩm tối đa 50 ký tự')
    .regex(/^[A-Za-z0-9_-]+$/, 'Mã sản phẩm chỉ được chứa chữ, số, gạch ngang và gạch dưới'),
  productName: z
    .string()
    .trim()
    .min(1, 'Tên sản phẩm không được để trống')
    .max(255, 'Tên sản phẩm tối đa 255 ký tự'),
  animalCategory: animalCategorySchema,
  packageWeightGrams: z
    .number()
    .int('Trọng lượng phải là số nguyên')
    .min(0, 'Trọng lượng không được âm'),
  packageWeightUnit: z.enum(['kg', 'g']).default('kg'),
  inventoryUnit: inventoryUnitSchema,
  brand: z.string().max(255).optional(),
  active: z.boolean().default(true),
  notes: z.string().max(1000).optional(),
})

export const updateProductSchema = createProductSchema.omit({ active: true }).partial().extend({
  id: z.number().int().positive(),
})

export const productListParamsSchema = z.object({
  search: z.string().optional(),
  animalCategory: animalCategorySchema.optional(),
  inventoryUnit: inventoryUnitSchema.optional(),
  activeOnly: z.boolean().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(500).optional(),
})

// ============================================================
// Supplier schemas
// ============================================================
export const createSupplierSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, 'Tên nhà cung cấp không được để trống')
    .max(255, 'Tên nhà cung cấp tối đa 255 ký tự'),
  phone: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.trim() === '' || /^\d{10}$/.test(v.trim()),
      'Số điện thoại phải gồm đúng 10 chữ số.'
    ),
  address: z.string().max(500).optional(),
  taxCode: z.string().max(20).optional(),
  contactPerson: z.string().max(255).optional(),
  bankAccount: z.string().max(255).optional(),
  notes: z.string().max(1000).optional(),
})

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  id: z.number().int().positive(),
})

// ============================================================
// Purchase Invoice schemas
// ============================================================
export const purchaseInvoiceItemInputSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
  lineTotal: z.number().int().positive('Tổng giá trị nhập phải lớn hơn 0'),
  notes: z.string().max(500).optional(),
})

export const createPurchaseInvoiceSchema = z.object({
  // Lưu dạng TEXT để giữ số 0 đầu
  invoiceNumber: z
    .string()
    .trim()
    .min(1, 'Số hóa đơn không được để trống')
    .max(100, 'Số hóa đơn tối đa 100 ký tự'),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày không hợp lệ (YYYY-MM-DD)'),
  receivedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày không hợp lệ (YYYY-MM-DD)'),
  supplierId: z.number().int().positive('Vui lòng chọn nhà cung cấp'),
  notes: z.string().max(1000).optional(),
  items: z
    .array(purchaseInvoiceItemInputSchema)
    .min(1, 'Phiếu nhập phải có ít nhất một sản phẩm'),
}).superRefine((data, context) => {
  const ids = new Set<number>()
  data.items.forEach((item, index) => {
    if (ids.has(item.productId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'productId'], message: 'Sản phẩm không được trùng trong cùng phiếu' })
    ids.add(item.productId)
  })
})

export const updatePurchaseInvoiceSchema = z.object({
  id: z.number().int().positive(),
  invoiceNumber: z.string().trim().min(1).max(100).optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  supplierId: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(purchaseInvoiceItemInputSchema).min(1).optional(),
})

// ============================================================
// Sales Invoice schemas
// ============================================================
export const salesInvoiceItemInputSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
  lineTotalSale: z.number().int().positive('Tổng giá trị xuất/bán phải lớn hơn 0'),
})

export const createSalesInvoiceSchema = z.object({
  electronicInvoiceNumber: z.string().trim().max(100).optional(),
  invoiceDate: z.string().refine((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, 'Ngày hóa đơn không hợp lệ'),
  buyerType: buyerTypeSchema.default('khach_le'),
  buyerName: z.string().trim().max(255).optional(),
  notes: z.string().max(1000).optional(),
  items: z
    .array(salesInvoiceItemInputSchema)
    .min(1, 'Phiếu xuất phải có ít nhất một sản phẩm'),
}).superRefine((data, context) => {
  const ids = new Set<number>()
  data.items.forEach((item, index) => {
    if (ids.has(item.productId)) context.addIssue({
      code: z.ZodIssueCode.custom, path: ['items', index, 'productId'],
      message: 'Sản phẩm không được trùng trong cùng phiếu',
    })
    ids.add(item.productId)
  })
})

export const updateSalesInvoiceSchema = z.object({
  id: z.number().int().positive(),
  electronicInvoiceNumber: z.string().trim().max(100).optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  buyerType: buyerTypeSchema.optional(),
  buyerName: z.string().trim().max(255).optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(salesInvoiceItemInputSchema).min(1).optional(),
})

export const cancelSaleSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
})

// ============================================================
// Supplier Payment schemas
// ============================================================
export const createSupplierPaymentSchema = z.object({
  purchaseInvoiceId: z.number().int().positive(),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày không hợp lệ (YYYY-MM-DD)'),
  amount: z.number().int().positive('Số tiền thanh toán phải lớn hơn 0'),
  paymentMethod: paymentMethodSchema.default('chuyen_khoan'),
  transactionReference: z.string().max(255).optional(),
  notes: z.string().max(500).optional(),
})

const validReportDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Ngày không hợp lệ')

export const reportParamsSchema = z.object({
  dateFrom: validReportDate,
  dateTo: validReportDate,
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(500).optional(),
  productId: z.number().int().positive().optional(),
  supplierId: z.number().int().positive().optional(),
  animalCategory: animalCategorySchema.optional(),
  inventoryUnit: inventoryUnitSchema.optional(),
  buyerType: buyerTypeSchema.optional(),
  invoiceType: z.enum(['purchase', 'sale', 'all']).optional(),
  status: invoiceStatusSchema.optional(),
  search: z.string().trim().optional(),
  sortBy: z.string().max(50).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
}).refine((value) => value.dateFrom <= value.dateTo, {
  message: 'Ngày bắt đầu không được sau ngày kết thúc',
  path: ['dateTo'],
})

export const reportExportRequestSchema = z.object({
  reportType: z.enum(['import_export', 'revenue', 'product_sales', 'supplier_debt', 'price_history']),
  filters: reportParamsSchema,
})

// ============================================================
// Settings schemas
// ============================================================
export const appSettingsSchema = z.object({
  storeName: z.string().min(1).max(255),
  taxCode: z.string().max(20).default(''),
  address: z.string().max(500).default(''),
  phone: z.string().max(50).default(''),
  currency: z.string().default('VND'),
  backupFolder: z.string().default(''),
  automaticBackupEnabled: z.boolean().default(false),
  backupRetentionCount: z.number().int().min(1).max(100).default(10),
  lastSuccessfulBackupDate: z.string().default(''),
  lastBackupFile: z.string().default(''),
  lastBackupError: z.string().default(''),
})

// ============================================================
// Import schemas
// ============================================================
export const importColumnMappingSchema = z.object({
  sourceColumn: z.string(),
  targetField: z.string(),
})

export const importValidateRequestSchema = z.object({
  importSessionId: z.string().uuid(),
  sheetName: z.string().min(1),
  importType: z.enum(['products', 'opening_inventory', 'purchase_invoices', 'sales_invoices', 'nxtgui_inventory_summary']),
  headerRow: z.number().int().min(0),
  mappings: z.array(importColumnMappingSchema),
  options: z.object({
    mode: z.enum(['import_as_draft', 'import_as_confirmed', 'reconcile_only', 'initialize_closing_stock']).optional(),
    existingProduct: z.enum(['skip', 'update_non_financial_fields', 'error']).optional(),
    allowNegativeStock: z.boolean().optional(),
    allowNegativeLegacyStock: z.boolean().optional(),
    defaultSupplierId: z.number().int().positive().optional(),
    transactionMode: z.enum(['all_or_nothing', 'per_invoice']).optional(),
    snapshotDate: z.string().optional(),
  }).optional(),
})

export const importExecuteRequestSchema = z.object({
  importSessionId: z.string().uuid(),
})

// Type exports for convenience
export type CreateProductInput = z.input<typeof createProductSchema>
export type UpdateProductInput = z.input<typeof updateProductSchema>
export type CreateSupplierInput = z.input<typeof createSupplierSchema>
export type UpdateSupplierInput = z.input<typeof updateSupplierSchema>
export type CreatePurchaseInvoiceInput = z.input<typeof createPurchaseInvoiceSchema>
export type UpdatePurchaseInvoiceInput = z.input<typeof updatePurchaseInvoiceSchema>
export type CreateSalesInvoiceInput = z.input<typeof createSalesInvoiceSchema>
export type UpdateSalesInvoiceInput = z.input<typeof updateSalesInvoiceSchema>
export type CreateSupplierPaymentInput = z.input<typeof createSupplierPaymentSchema>
export type AppSettingsInput = z.input<typeof appSettingsSchema>

// Re-export for use in type checks
export type { AnimalCategory, InventoryUnit, PaymentMethod, BuyerType }
