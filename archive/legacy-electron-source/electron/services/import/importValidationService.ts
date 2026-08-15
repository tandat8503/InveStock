import { getSqlite } from '../../db/connection'
import type {
  ImportValidateRequest,
  ImportValidationError,
  ImportValidationResult,
  ImportValidationWarning,
} from '../../../shared/ipc-types'
import type { NormalizedImportRow } from './importModels'
import { normalizeImportRow } from './importNormalizationService'
import { cellText, readImportSheet } from './importParsingService'
import { importSessionService, type ImportSessionService } from './importSessionService'
import { isNxtguiProductCode } from './nxtguiParsingService'

const REQUIRED_FIELDS: Record<ImportValidateRequest['importType'], string[]> = {
  products: ['productCode', 'productName', 'inventoryUnit'],
  opening_inventory: ['productCode', 'quantity', 'unitCost', 'openingDate'],
  purchase_invoices: ['productCode', 'quantity', 'invoiceNumber', 'invoiceDate'],
  sales_invoices: ['productCode', 'quantity', 'invoiceNumber', 'invoiceDate'],
  nxtgui_inventory_summary: ['productCode', 'productName', 'inventoryUnit'],
}

function error(
  errors: ImportValidationError[],
  rowNumber: number,
  column: string,
  code: string,
  message: string,
  originalValue?: unknown
): void {
  errors.push({ rowNumber, column, code, message, originalValue, severity: 'error' })
}

export class ImportValidationService {
  constructor(private readonly sessions: ImportSessionService = importSessionService) {}

  validate(request: ImportValidateRequest): ImportValidationResult {
    const session = this.sessions.get(request.importSessionId)
    const rows = readImportSheet(session.workbook, request.sheetName)
    const headers = (rows[request.headerRow] ?? []).map(cellText)
    const indexes = new Map(request.mappings.map(
      (mapping) => [mapping.targetField, headers.indexOf(mapping.sourceColumn)]
    ))
    const errors: ImportValidationError[] = []
    const warnings: ImportValidationWarning[] = []
    const normalizedRows: NormalizedImportRow[] = []
    const seenProductCodes = new Set<string>()
    const sqlite = getSqlite()

    for (const field of REQUIRED_FIELDS[request.importType]) {
      if ((indexes.get(field) ?? -1) < 0) {
        error(errors, request.headerRow + 1, field, 'REQUIRED_MAPPING', `Thiếu mapping ${field}`)
      }
    }
    if (request.importType === 'purchase_invoices' && !request.options?.defaultSupplierId) {
      error(errors, request.headerRow + 1, 'defaultSupplierId', 'REQUIRED_SUPPLIER', 'Thiếu nhà cung cấp mặc định')
    }

    rows.slice(request.headerRow + 1).forEach((row, offset) => {
      if (row.every((cell) => cellText(cell) === '')) return
      const rowNumber = request.headerRow + offset + 2

      if (request.importType === 'nxtgui_inventory_summary') {
        const codeCell = cellText(row[indexes.get('productCode') ?? -1])
        if (!isNxtguiProductCode(codeCell)) return // Skip header/footer/junk rows
      }

      const normalized = normalizeImportRow({ importType: request.importType, row, columnIndexes: indexes })
      const code = String(normalized.productCode)
      if (!code) error(errors, rowNumber, 'productCode', 'REQUIRED', 'Mã sản phẩm bắt buộc')

      const databaseProduct = code
        ? sqlite.prepare(
          'SELECT id, inventory_unit, current_stock, average_cost FROM products WHERE product_code = ?'
        ).get(code) as { id: number; inventory_unit: string; current_stock: number; average_cost: number } | undefined
        : undefined

      if (request.importType === 'nxtgui_inventory_summary') {
        if (seenProductCodes.has(code)) {
          error(errors, rowNumber, 'productCode', 'DUPLICATE_PRODUCT_CODE', 'Mã trùng trong file', code)
        }
        seenProductCodes.add(code)
        if (!normalized.productName) error(errors, rowNumber, 'productName', 'REQUIRED', 'Tên sản phẩm bắt buộc')

        const fieldsQty = ['openingQuantity', 'purchaseQuantity', 'saleQuantity', 'closingQuantity'] as const
        for (const field of fieldsQty) {
          const val = normalized[field] ?? 0
          if (!Number.isInteger(Number(val))) {
            error(errors, rowNumber, field, 'INVALID_INTEGER', `Số lượng ${field} phải là số nguyên`, val)
          }
        }

        const openQty = Number(normalized.openingQuantity ?? 0)
        const purQty = Number(normalized.purchaseQuantity ?? 0)
        const saleQty = Number(normalized.saleQuantity ?? 0)
        const closeQty = Number(normalized.closingQuantity ?? 0)

        // Equation check
        if (closeQty !== openQty + purQty - saleQty) {
          warnings.push({
            rowNumber,
            column: 'closingQuantity',
            code: 'EQUATION_MISMATCH',
            message: `Phương trình tồn không khớp: ${closeQty} != ${openQty} + ${purQty} - ${saleQty}`,
            originalValue: closeQty,
            severity: 'warning',
          })
        }

        // Unit mismatch check
        if (databaseProduct && databaseProduct.inventory_unit !== String(normalized.inventoryUnit)) {
          warnings.push({
            rowNumber,
            column: 'inventoryUnit',
            code: 'UNIT_MISMATCH',
            message: `Đơn vị tính khác với database (DB: ${databaseProduct.inventory_unit}, file: ${normalized.inventoryUnit})`,
            originalValue: normalized.inventoryUnit,
            severity: 'warning',
          })
        }

        // Negative stock check
        if (closeQty < 0 || openQty < 0) {
          if (request.options?.allowNegativeLegacyStock) {
            warnings.push({
              rowNumber,
              column: 'closingQuantity',
              code: 'LEGACY_NEGATIVE_STOCK',
              message: `Tồn âm kế thừa (${closeQty})`,
              originalValue: closeQty,
              severity: 'warning',
            })
          } else {
            error(errors, rowNumber, 'closingQuantity', 'LEGACY_NEGATIVE_STOCK', 'Tồn âm bị chặn mặc định (cần bật cho phép tồn âm)', closeQty)
          }
        }
      } else if (request.importType === 'products') {
        if (seenProductCodes.has(code)) {
          error(errors, rowNumber, 'productCode', 'DUPLICATE_PRODUCT_CODE', 'Mã trùng trong file', code)
        }
        seenProductCodes.add(code)
        if (!normalized.productName) error(errors, rowNumber, 'productName', 'REQUIRED', 'Tên sản phẩm bắt buộc')
        if (!['Bao', 'Tui', 'Bich'].includes(String(normalized.inventoryUnit))) {
          error(errors, rowNumber, 'inventoryUnit', 'INVALID_UNIT', 'Đơn vị phải là Bao, Tui hoặc Bich', normalized.inventoryUnit)
        }
        if (Number(normalized.currentSalePrice) < 0) {
          error(errors, rowNumber, 'currentSalePrice', 'NEGATIVE_PRICE', 'Giá bán không được âm', normalized.currentSalePrice)
        }
        if (databaseProduct && (request.options?.existingProduct ?? 'error') === 'error') {
          error(errors, rowNumber, 'productCode', 'DUPLICATE_DATABASE', 'Mã sản phẩm đã tồn tại', code)
        }
      } else {
        const invoiceCell = row[indexes.get('invoiceNumber') ?? -1]
        if (request.importType.includes('invoices') && typeof invoiceCell === 'number') {
          warnings.push({
            rowNumber,
            column: 'invoiceNumber',
            code: 'NUMERIC_INVOICE_FORMAT',
            message: 'Số hóa đơn dạng numeric có thể đã mất số 0 đầu',
            originalValue: invoiceCell,
            normalizedValue: String(invoiceCell),
            severity: 'warning',
          })
        }
        if (!databaseProduct) error(errors, rowNumber, 'productCode', 'UNKNOWN_PRODUCT', 'Sản phẩm không tồn tại', code)
        const quantity = normalized.quantity
        if (quantity === null || !Number.isInteger(quantity)) {
          error(errors, rowNumber, 'quantity', 'INVALID_INTEGER', 'Số lượng phải là số nguyên', quantity)
        }
        if (request.importType !== 'opening_inventory' && Number(quantity) <= 0) {
          error(errors, rowNumber, 'quantity', 'NON_POSITIVE_QUANTITY', 'Số lượng phải lớn hơn 0', quantity)
        }
        if (request.importType === 'opening_inventory') {
          if (Number(quantity) < 0 && !request.options?.allowNegativeStock) {
            error(errors, rowNumber, 'quantity', 'LEGACY_NEGATIVE_STOCK', 'Tồn âm bị chặn mặc định', quantity)
          } else if (Number(quantity) < 0) {
            warnings.push({ rowNumber, column: 'quantity', code: 'LEGACY_NEGATIVE_STOCK', message: 'Tồn âm kế thừa', originalValue: quantity, severity: 'warning' })
          }
          if (normalized.unitCost === null || Number(normalized.unitCost) < 0) {
            error(errors, rowNumber, 'unitCost', 'INVALID_UNIT_COST', 'Giá vốn phải là số không âm', normalized.unitCost)
          }
          if (!normalized.openingDate) error(errors, rowNumber, 'openingDate', 'INVALID_DATE', 'Ngày tồn đầu không hợp lệ')
          if (databaseProduct && sqlite.prepare(
            'SELECT 1 FROM inventory_transactions WHERE product_id = ? LIMIT 1'
          ).get(databaseProduct.id)) {
            error(errors, rowNumber, 'productCode', 'PRODUCT_HAS_TRANSACTIONS', 'Sản phẩm đã có giao dịch kho', code)
          }
        } else {
          if (!normalized.invoiceNumber) error(errors, rowNumber, 'invoiceNumber', 'REQUIRED', 'Số hóa đơn bắt buộc')
          if (!normalized.invoiceDate) error(errors, rowNumber, 'invoiceDate', 'INVALID_DATE', 'Ngày hóa đơn không hợp lệ')
          if (normalized.unitPrice === null || Number(normalized.unitPrice) < 0) {
            error(errors, rowNumber, 'unitPrice', 'MISSING_PRICE', 'Thiếu đơn giá hợp lệ', normalized.unitPrice)
          }
        }
      }
      normalizedRows.push(normalized)
    })

    this.addInvoiceChecks(request, normalizedRows, errors)
    const errorRows = new Set(errors.map((item) => item.rowNumber)).size
    const warningRows = new Set(warnings.map((item) => item.rowNumber)).size
    const missingProducts = [...new Set(errors
      .filter((item) => item.code === 'UNKNOWN_PRODUCT')
      .map((item) => String(item.originalValue ?? ''))
      .filter(Boolean))]
    const result: ImportValidationResult = {
      importSessionId: session.id,
      totalRows: normalizedRows.length,
      validRows: normalizedRows.length - errorRows,
      warningRows,
      errorRows,
      ignoredRows: 0,
      groupedDocuments: new Set(normalizedRows.map((row) => row.invoiceNumber).filter(Boolean)).size,
      errors,
      warnings,
      normalizedPreview: normalizedRows.slice(0, 50),
      canExecute: errors.length === 0,
      detectedDuplicates: errors.filter((item) => item.code.includes('DUPLICATE')).map((item) => String(item.originalValue ?? '')),
      missingProducts,
      createdProductsPlan: [],
      summary: errors.length ? `${errors.length} lỗi cần xử lý` : `${normalizedRows.length} dòng hợp lệ`,
    }
    Object.assign(session, {
      sheet: request.sheetName,
      headerRow: request.headerRow,
      mappings: request.mappings,
      normalizedRows,
      validationResult: result,
      options: request.options,
      request,
    })
    return result
  }

  private addInvoiceChecks(
    request: ImportValidateRequest,
    rows: NormalizedImportRow[],
    errors: ImportValidationError[]
  ): void {
    if (request.importType !== 'purchase_invoices' && request.importType !== 'sales_invoices') return
    const sqlite = getSqlite()
    for (const invoiceNumber of new Set(rows.map((row) => String(row.invoiceNumber)))) {
      const duplicate = request.importType === 'purchase_invoices'
        ? sqlite.prepare(
          'SELECT 1 FROM purchase_invoices WHERE supplier_id = ? AND invoice_number = ? LIMIT 1'
        ).get(request.options?.defaultSupplierId, invoiceNumber)
        : sqlite.prepare(
          'SELECT 1 FROM sales_invoices WHERE electronic_invoice_number = ? LIMIT 1'
        ).get(invoiceNumber)
      if (duplicate) error(errors, request.headerRow + 1, 'invoiceNumber', 'DUPLICATE_INVOICE', `Hóa đơn ${invoiceNumber} đã tồn tại`, invoiceNumber)
    }
    if (request.importType === 'sales_invoices' && request.options?.mode === 'import_as_confirmed') {
      const totals = new Map<string, number>()
      for (const row of rows) totals.set(String(row.productCode), (totals.get(String(row.productCode)) ?? 0) + Number(row.quantity))
      for (const [productCode, quantity] of totals) {
        const product = sqlite.prepare(
          'SELECT current_stock FROM products WHERE product_code = ?'
        ).get(productCode) as { current_stock: number } | undefined
        if (product && quantity > product.current_stock) {
          error(errors, request.headerRow + 1, 'quantity', 'INSUFFICIENT_STOCK', `${productCode}: tổng xuất vượt tồn`, quantity)
        }
      }
    }
  }
}
