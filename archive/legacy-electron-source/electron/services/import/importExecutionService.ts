import { getSqlite } from '../../db/connection'
import { getPurchaseRepository } from '../../repositories/purchaseRepository'
import { getSaleRepository } from '../../repositories/saleRepository'
import { importJobRepository, type ImportJobRepository } from '../../repositories/importJobRepository'
import { getPurchaseService } from '../purchaseService'
import { getSaleService } from '../saleService'
import { operationCoordinator } from '../operationCoordinator'
import type { ImportExecuteRequest, ImportResult } from '../../../shared/ipc-types'
import type { ImportSession, NormalizedImportRow } from './importModels'
import { importSessionService, type ImportSessionService } from './importSessionService'

export class ImportExecutionService {
  constructor(
    private readonly sessions: ImportSessionService = importSessionService,
    private readonly jobs: ImportJobRepository = importJobRepository
  ) {}

  execute(input: ImportExecuteRequest): Promise<ImportResult> {
    return operationCoordinator.run('import_execute', async () => {
      const session = this.sessions.get(input.importSessionId)
      if (!session.validationResult?.canExecute || !session.request || !session.normalizedRows) {
        throw new Error('Phiên import chưa được validate hoặc có lỗi')
      }
      const jobId = this.jobs.start({
        importType: session.request.importType,
        sourceFilename: session.fileName,
        sourceFileHash: session.fileHash,
        sheetName: session.request.sheetName,
        mode: session.request.options?.mode ?? 'import_as_draft',
        totalRows: session.normalizedRows.length,
        warningRows: session.validationResult.warningRows,
        errorRows: 0,
        options: session.request.options ?? {},
      })
      const sqlite = getSqlite()
      sqlite.exec('SAVEPOINT phase6_import_execution')
      try {
        const importedCount = await this.executeSession(session, jobId)
        sqlite.exec('RELEASE SAVEPOINT phase6_import_execution')
        this.jobs.succeed(jobId, importedCount)
        this.sessions.cancel(session.id)
        return {
          success: true,
          importedCount,
          skippedCount: session.normalizedRows.length - importedCount,
          importJobId: jobId,
          errors: [],
          warnings: session.validationResult.warnings,
        }
      } catch (failure) {
        sqlite.exec('ROLLBACK TO SAVEPOINT phase6_import_execution')
        sqlite.exec('RELEASE SAVEPOINT phase6_import_execution')
        this.jobs.fail(jobId, failure, [
          ...session.validationResult.errors,
          ...session.validationResult.warnings,
          {
            rowNumber: 0,
            column: 'execute',
            code: 'EXECUTION_FAILED',
            message: failure instanceof Error ? failure.message : String(failure),
            severity: 'error',
          },
        ])
        throw failure
      }
    })
  }

  private async executeSession(session: ImportSession, jobId: number): Promise<number> {
    const type = session.request?.importType
    if (!session.normalizedRows || !session.request || !type) throw new Error('Session không đầy đủ')
    if (type === 'products') return this.executeProducts(session)
    if (type === 'opening_inventory') return this.executeOpeningInventory(session, jobId)
    if (type === 'purchase_invoices') return this.executePurchases(session)
    if (type === 'nxtgui_inventory_summary') return this.executeNxtguiSummary(session, jobId)
    return this.executeSales(session)
  }

  private executeNxtguiSummary(session: ImportSession, jobId: number): number {
    const sqlite = getSqlite()
    const mode = session.options?.mode ?? 'reconcile_only'
    const snapshotDate = session.options?.snapshotDate || '2026-06-30'
    const periodLabel = session.request?.options?.proposedPeriodLabel || 'Q2/2026'
    const periodStart = session.request?.options?.proposedPeriodStart || '2026-04-01'
    const periodEnd = session.request?.options?.proposedPeriodEnd || '2026-06-30'
    let imported = 0

    for (let index = 0; index < (session.normalizedRows ?? []).length; index++) {
      const row = session.normalizedRows![index]
      const sourceRowNumber = index + (session.headerRow ?? 4) + 2

      const existing = sqlite.prepare(
        'SELECT id, current_stock, average_cost FROM products WHERE product_code = ?'
      ).get(row.productCode) as { id: number; current_stock: number; average_cost: number } | undefined

      let productId: number

      const closeQty = Number(row.closingQuantity ?? 0)
      const closeUnitCost = Number(row.closingUnitCost ?? 0)
      const openQty = Number(row.openingQuantity ?? 0)
      const openUnitCost = Number(row.openingUnitCost ?? 0)
      const openVal = Number(row.openingValue ?? 0)
      const purQty = Number(row.purchaseQuantity ?? 0)
      const purUnitCost = Number(row.purchaseUnitCost ?? 0)
      const purVal = Number(row.purchaseValue ?? 0)
      const saleQty = Number(row.saleQuantity ?? 0)
      const saleUnitCost = Number(row.saleUnitCost ?? 0)
      const saleVal = Number(row.saleValue ?? 0)
      const closeVal = Number(row.closingValue ?? 0)

      if (!existing) {
        const newStock = mode === 'initialize_closing_stock' ? closeQty : 0
        const newAvgCost = mode === 'initialize_closing_stock' ? closeUnitCost : 0
        const res = sqlite.prepare(`
          INSERT INTO products (
            product_code, product_name, animal_category, package_weight_grams,
            package_weight_unit, inventory_unit, brand, latest_purchase_price,
            average_cost, current_sale_price, current_stock, active, notes
          ) VALUES (?, ?, ?, 25000, 'kg', ?, NULL, ?, ?, 0, ?, 1, NULL)
        `).run(
          row.productCode,
          row.productName,
          row.animalCategory || 'khac',
          row.inventoryUnit || 'Bao',
          closeUnitCost,
          newAvgCost,
          newStock
        )
        productId = Number(res.lastInsertRowid)
      } else {
        productId = existing.id
        if (mode === 'initialize_closing_stock') {
          sqlite.prepare(`
            UPDATE products SET product_name = ?, animal_category = ?, inventory_unit = ?,
              current_stock = ?, average_cost = ?, updated_at = datetime('now','localtime')
            WHERE id = ?
          `).run(
            row.productName,
            row.animalCategory || 'khac',
            row.inventoryUnit || 'Bao',
            closeQty,
            closeUnitCost,
            productId
          )
        } else {
          sqlite.prepare(`
            UPDATE products SET product_name = ?, animal_category = ?, inventory_unit = ?,
              updated_at = datetime('now','localtime')
            WHERE id = ?
          `).run(
            row.productName,
            row.animalCategory || 'khac',
            row.inventoryUnit || 'Bao',
            productId
          )
        }
      }

      const rowWarnings = (session.validationResult?.warnings ?? [])
        .filter((w) => w.rowNumber === sourceRowNumber)
        .map((w) => w.message)

      const legacyRes = sqlite.prepare(`
        INSERT INTO legacy_inventory_summaries (
          import_job_id, product_id, period_label, period_start, period_end,
          opening_quantity, opening_unit_cost, opening_value,
          purchase_quantity, purchase_unit_cost, purchase_value,
          sale_quantity, sale_unit_cost, sale_value,
          closing_quantity, closing_unit_cost, closing_value,
          source_row_number, warnings_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        jobId,
        productId,
        periodLabel,
        periodStart,
        periodEnd,
        openQty,
        openUnitCost,
        openVal,
        purQty,
        purUnitCost,
        purVal,
        saleQty,
        saleUnitCost,
        saleVal,
        closeQty,
        closeUnitCost,
        closeVal,
        sourceRowNumber,
        JSON.stringify(rowWarnings)
      )

      const legacySummaryId = Number(legacyRes.lastInsertRowid)

      if (mode === 'initialize_closing_stock') {
        const qtyIn = closeQty >= 0 ? closeQty : 0
        const qtyOut = closeQty < 0 ? Math.abs(closeQty) : 0
        sqlite.prepare(`
          INSERT INTO inventory_transactions (
            transaction_date, product_id, transaction_type, source_type, source_id,
            quantity_in, quantity_out, unit_cost, stock_after, created_at
          ) VALUES (?, ?, 'legacy_opening', 'legacy_summary', ?, ?, ?, ?, ?, ?)
        `).run(
          snapshotDate,
          productId,
          legacySummaryId,
          qtyIn,
          qtyOut,
          closeUnitCost,
          closeQty,
          `${snapshotDate} 00:00:00`
        )
      }

      imported++
    }

    return imported
  }

  private executeProducts(session: ImportSession): number {
    const sqlite = getSqlite()
    let imported = 0
    for (const row of session.normalizedRows ?? []) {
      const existing = sqlite.prepare(
        'SELECT id FROM products WHERE product_code = ?'
      ).get(row.productCode) as { id: number } | undefined
      const policy = session.options?.existingProduct ?? 'error'
      if (existing && policy === 'skip') continue
      if (existing && policy === 'update_non_financial_fields') {
        sqlite.prepare(`
          UPDATE products SET product_name = ?, animal_category = ?,
            package_weight_grams = ?, inventory_unit = ?, brand = ?, notes = ?,
            updated_at = datetime('now','localtime') WHERE id = ?
        `).run(
          row.productName,
          row.animalCategory,
          row.packageWeightGrams,
          row.inventoryUnit,
          row.brand || null,
          row.notes || null,
          existing.id
        )
        imported += 1
        continue
      }
      if (existing) throw new Error(`Mã sản phẩm ${row.productCode} đã tồn tại`)
      sqlite.prepare(`
        INSERT INTO products (
          product_code, product_name, animal_category, package_weight_grams,
          inventory_unit, brand, current_sale_price, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.productCode,
        row.productName,
        row.animalCategory,
        row.packageWeightGrams,
        row.inventoryUnit,
        row.brand || null,
        row.currentSalePrice,
        row.notes || null
      )
      imported += 1
    }
    return imported
  }

  private executeOpeningInventory(session: ImportSession, jobId: number): number {
    const sqlite = getSqlite()
    let imported = 0
    for (const row of session.normalizedRows ?? []) {
      const product = sqlite.prepare(
        'SELECT id, current_stock, average_cost FROM products WHERE product_code = ?'
      ).get(row.productCode) as {
        id: number
        current_stock: number
        average_cost: number
      } | undefined
      if (!product) throw new Error(`Không tìm thấy sản phẩm ${row.productCode}`)
      if (sqlite.prepare(
        'SELECT 1 FROM inventory_transactions WHERE product_id = ? LIMIT 1'
      ).get(product.id)) {
        throw new Error(`Sản phẩm ${row.productCode} đã có giao dịch`)
      }
      const quantity = Number(row.quantity)
      const unitCost = Number(row.unitCost)
      sqlite.prepare(
        'UPDATE products SET current_stock = ?, average_cost = ? WHERE id = ?'
      ).run(quantity, unitCost, product.id)
      sqlite.prepare(`
        INSERT INTO inventory_transactions (
          transaction_date, product_id, transaction_type, source_type, source_id,
          quantity_in, quantity_out, unit_cost, stock_before, stock_after,
          old_average_cost, new_average_cost
        ) VALUES (?, ?, 'opening', 'adjustment', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.openingDate,
        product.id,
        jobId,
        Math.max(quantity, 0),
        Math.max(-quantity, 0),
        unitCost,
        product.current_stock,
        quantity,
        product.average_cost,
        unitCost
      )
      imported += 1
    }
    return imported
  }

  private async executePurchases(session: ImportSession): Promise<number> {
    const supplierId = session.options?.defaultSupplierId
    if (!supplierId) throw new Error('Vui lòng chọn nhà cung cấp mặc định')
    let imported = 0
    for (const [invoiceNumber, rows] of this.groupInvoices(session.normalizedRows ?? [])) {
      const items = rows.map((row) => ({
        productId: this.productId(String(row.productCode)),
        quantity: Number(row.quantity),
        invoiceUnitPrice: Number(row.unitPrice),
        discountAmount: 0,
        shippingAllocation: 0,
      }))
      const invoice = await getPurchaseRepository().create({
        invoiceNumber,
        invoiceDate: String(rows[0]?.invoiceDate),
        receivedDate: String(rows[0]?.invoiceDate),
        supplierId,
        discountAmount: 0,
        shippingCost: 0,
        shippingAllocationMethod: 'quantity',
        taxAmount: 0,
        paymentMethod: 'chuyen_khoan',
        items,
      })
      if (session.options?.mode === 'import_as_confirmed') {
        await getPurchaseService().confirm(invoice.id)
      }
      imported += rows.length
    }
    return imported
  }

  private async executeSales(session: ImportSession): Promise<number> {
    let imported = 0
    for (const [invoiceNumber, rows] of this.groupInvoices(session.normalizedRows ?? [])) {
      const items = rows.map((row) => ({
        productId: this.productId(String(row.productCode)),
        quantity: Number(row.quantity),
        unitSalePrice: Number(row.unitPrice),
      }))
      const invoice = await getSaleRepository().create({
        electronicInvoiceNumber: invoiceNumber,
        invoiceDate: String(rows[0]?.invoiceDate),
        buyerType: 'khach_le',
        items,
      })
      if (session.options?.mode === 'import_as_confirmed') {
        await getSaleService().confirm(invoice.id)
      }
      imported += rows.length
    }
    return imported
  }

  private productId(productCode: string): number {
    const row = getSqlite().prepare(
      'SELECT id FROM products WHERE product_code = ?'
    ).get(productCode) as { id: number } | undefined
    if (!row) throw new Error(`Không tìm thấy sản phẩm ${productCode}`)
    return row.id
  }

  private groupInvoices(rows: NormalizedImportRow[]): Map<string, NormalizedImportRow[]> {
    const groups = new Map<string, NormalizedImportRow[]>()
    for (const row of rows) {
      const invoiceNumber = String(row.invoiceNumber)
      groups.set(invoiceNumber, [...(groups.get(invoiceNumber) ?? []), row])
    }
    return groups
  }
}
