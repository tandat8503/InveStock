import { type SQL, eq, and, sql, desc, ne } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/connection'
import {
  purchaseInvoices,
  purchaseInvoiceItems,
  supplierPayments,
  suppliers,
  products,
} from '../db/schema'
import type { PurchaseInvoiceDTO, PaginatedResult } from '../../shared/ipc-types'
import type {
  CreatePurchaseInvoiceInput,
  UpdatePurchaseInvoiceInput,
  CreateSupplierPaymentInput,
} from '../../shared/schemas'
import {
  allocateShippingByQuantity,
  allocateShippingByValue,
  calculateEffectiveUnitCost,
} from '../services/inventoryService'

type NormalizedItem = CreatePurchaseInvoiceInput['items'][number] & {
  effectiveUnitCost: number
  lineTotal: number
}

function normalizeItems(
  items: CreatePurchaseInvoiceInput['items'],
  shippingCost = 0,
  method: CreatePurchaseInvoiceInput['shippingAllocationMethod'] = 'quantity'
): NormalizedItem[] {
  const baseValues = items.map((item) => item.quantity * item.invoiceUnitPrice - (item.discountAmount ?? 0))
  const allocations = method === 'quantity'
    ? allocateShippingByQuantity(items, shippingCost)
    : method === 'value'
      ? allocateShippingByValue(baseValues.map((lineTotal) => ({ lineTotal })), shippingCost)
      : items.map((item) => item.shippingAllocation ?? 0)
  if (allocations.reduce((sum, value) => sum + value, 0) !== shippingCost) {
    throw new Error('Tổng phân bổ vận chuyển phải bằng chi phí vận chuyển')
  }
  return items.map((item, index) => ({
    ...item,
    discountAmount: item.discountAmount ?? 0,
    shippingAllocation: allocations[index] ?? 0,
    lineTotal: (baseValues[index] ?? 0) + (allocations[index] ?? 0),
    effectiveUnitCost: calculateEffectiveUnitCost(
      item.invoiceUnitPrice,
      item.quantity,
      item.discountAmount ?? 0,
      allocations[index] ?? 0
    ),
  }))
}

function generateReceiptCode(): string {
  const db = getSqlite()
  const result = db
    .prepare(`SELECT COUNT(*) as cnt FROM purchase_invoices`)
    .get() as { cnt: number }
  const num = (result.cnt + 1).toString().padStart(6, '0')
  return `PN${num}`
}

class PurchaseRepository {
  async list(params: Record<string, unknown>): Promise<PaginatedResult<PurchaseInvoiceDTO>> {
    const db = getDb()
    const page = (params.page as number) ?? 1
    const pageSize = (params.pageSize as number) ?? 20

    const conditions: SQL[] = []

    if (params.search) {
      const searchTerm = `%${params.search as string}%`
      conditions.push(
        sql`(${purchaseInvoices.invoiceNumber} LIKE ${searchTerm} OR ${purchaseInvoices.receiptCode} LIKE ${searchTerm})`
      )
    }

    if (params.supplierId) {
      conditions.push(eq(purchaseInvoices.supplierId, params.supplierId as number))
    }

    if (params.status) {
      conditions.push(eq(purchaseInvoices.status, params.status as string))
    }

    if (params.dateFrom) {
      conditions.push(sql`${purchaseInvoices.invoiceDate} >= ${params.dateFrom}`)
    }

    if (params.dateTo) {
      conditions.push(sql`${purchaseInvoices.invoiceDate} <= ${params.dateTo}`)
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseInvoices)
      .where(whereClause)

    const rows = await db
      .select({
        invoice: purchaseInvoices,
        supplierName: suppliers.companyName,
      })
      .from(purchaseInvoices)
      .innerJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
      .where(whereClause)
      .orderBy(desc(purchaseInvoices.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return {
      items: rows.map((r) => this.mapToDTO(r.invoice, r.supplierName, [])),
      total: countResult.count,
      page,
      pageSize,
    }
  }

  async getById(id: number): Promise<PurchaseInvoiceDTO> {
    const db = getDb()
    const [row] = await db
      .select({
        invoice: purchaseInvoices,
        supplierName: suppliers.companyName,
      })
      .from(purchaseInvoices)
      .innerJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
      .where(eq(purchaseInvoices.id, id))

    if (!row) throw new Error(`Phiếu nhập #${id} không tồn tại`)

    const items = await db
      .select({
        item: purchaseInvoiceItems,
        productCode: products.productCode,
        productName: products.productName,
        inventoryUnit: products.inventoryUnit,
      })
      .from(purchaseInvoiceItems)
      .innerJoin(products, eq(purchaseInvoiceItems.productId, products.id))
      .where(eq(purchaseInvoiceItems.purchaseInvoiceId, id))

    return this.mapToDTO(row.invoice, row.supplierName, items)
  }

  async create(input: CreatePurchaseInvoiceInput): Promise<PurchaseInvoiceDTO> {
    const sqlite = getSqlite()
    const invoiceNumber = input.invoiceNumber.trim()
    if (await this.checkDuplicateInvoiceNumber(input.supplierId, invoiceNumber)) {
      throw new Error('Số hóa đơn đã tồn tại ở nhà cung cấp này')
    }
    const normalizedItems = normalizeItems(
      input.items,
      input.shippingCost ?? 0,
      input.shippingAllocationMethod
    )
    const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.invoiceUnitPrice, 0)
    const lineDiscount = input.items.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0)
    const discountAmount = lineDiscount + (input.discountAmount ?? 0)
    const grandTotal = subtotal - discountAmount + (input.taxAmount ?? 0) + (input.shippingCost ?? 0)
    if (grandTotal < 0) throw new Error('Tổng phải thanh toán không được âm')
    const remainingAmount = grandTotal

    const receiptCode = generateReceiptCode()
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

    const insertFn = sqlite.transaction(() => {
      const [invoice] = sqlite
        .prepare(`
          INSERT INTO purchase_invoices (
            receipt_code, invoice_number, invoice_date, received_date, supplier_id,
            subtotal, discount_amount, tax_amount, shipping_cost, grand_total,
            paid_amount, remaining_amount, payment_status, shipping_allocation_method,
            payment_method, status, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'chua_thanh_toan', ?, ?, 'nhap', ?, ?)
          RETURNING *
        `)
        .all(
          receiptCode,
          invoiceNumber,
          input.invoiceDate,
          input.receivedDate,
          input.supplierId,
          subtotal,
          discountAmount,
          input.taxAmount,
          input.shippingCost,
          grandTotal,
          remainingAmount,
          input.shippingAllocationMethod,
          input.paymentMethod,
          input.notes ?? null,
          now
        ) as (typeof purchaseInvoices.$inferSelect)[]

      for (const item of normalizedItems) {
        sqlite
          .prepare(`
            INSERT INTO purchase_invoice_items (
              purchase_invoice_id, product_id, quantity, invoice_unit_price,
              discount_amount, shipping_allocation, effective_unit_cost, line_total, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            invoice.id,
            item.productId,
            item.quantity,
            item.invoiceUnitPrice,
            item.discountAmount,
            item.shippingAllocation,
            item.effectiveUnitCost,
            item.lineTotal,
            item.notes ?? null
          )
      }

      return invoice
    })

    const created = insertFn()
    return this.getById(created.id)
  }

  async update(input: UpdatePurchaseInvoiceInput): Promise<PurchaseInvoiceDTO> {
    const sqlite = getSqlite()

    const current = await this.getById(input.id)
    if (current.status !== 'nhap') {
      throw new Error('Chỉ có thể sửa phiếu nhập ở trạng thái nháp')
    }

    const updateFn = sqlite.transaction(() => {
      const shippingCost = input.shippingCost ?? current.shippingCost
      const method = input.shippingAllocationMethod ?? current.shippingAllocationMethod
      const rawItems: CreatePurchaseInvoiceInput['items'] = input.items
        ? input.items
        : current.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            invoiceUnitPrice: item.invoiceUnitPrice,
            discountAmount: item.discountAmount,
            shippingAllocation: item.shippingAllocation,
            notes: item.notes ?? undefined,
          }))
      const items = normalizeItems(rawItems, shippingCost, method)

      // Recalculate totals
      const subtotal = items.reduce((sum, i) => sum + i.quantity * i.invoiceUnitPrice, 0)
      const lineDiscount = items.reduce((sum, i) => sum + (i.discountAmount ?? 0), 0)
      const discountAmount = lineDiscount + (input.discountAmount ?? Math.max(0, current.discountAmount - current.items.reduce((sum, item) => sum + item.discountAmount, 0)))
      const taxAmount = input.taxAmount ?? current.taxAmount
      const grandTotal = subtotal - discountAmount + taxAmount + shippingCost
      const paidAmount = current.paidAmount
      const remainingAmount = grandTotal - paidAmount

      sqlite
        .prepare(`
          UPDATE purchase_invoices SET
            invoice_number = ?, invoice_date = ?, received_date = ?, supplier_id = ?,
            subtotal = ?, discount_amount = ?, tax_amount = ?, shipping_cost = ?,
            grand_total = ?, paid_amount = ?, remaining_amount = ?,
            shipping_allocation_method = ?,
            payment_method = ?, notes = ?
          WHERE id = ?
        `)
        .run(
          input.invoiceNumber ?? current.invoiceNumber,
          input.invoiceDate ?? current.invoiceDate,
          input.receivedDate ?? current.receivedDate,
          input.supplierId ?? current.supplierId,
          subtotal,
          discountAmount,
          taxAmount,
          shippingCost,
          grandTotal,
          paidAmount,
          remainingAmount,
          method,
          input.paymentMethod ?? current.paymentMethod,
          input.notes ?? current.notes,
          input.id
        )

      if (input.items || input.shippingCost !== undefined || input.shippingAllocationMethod !== undefined) {
        sqlite
          .prepare('DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = ?')
          .run(input.id)

        for (const item of items) {
          sqlite
            .prepare(`
              INSERT INTO purchase_invoice_items (
                purchase_invoice_id, product_id, quantity, invoice_unit_price,
                discount_amount, shipping_allocation, effective_unit_cost, line_total, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              input.id,
              item.productId,
              item.quantity,
              item.invoiceUnitPrice,
              item.discountAmount,
              item.shippingAllocation,
              item.effectiveUnitCost,
              item.lineTotal,
              item.notes ?? null
            )
        }
      }
    })

    updateFn()
    return this.getById(input.id)
  }

  async deleteDraft(id: number): Promise<void> {
    const db = getDb()
    const sqlite = getSqlite()

    const [invoice] = await db
      .select()
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.id, id))

    if (!invoice) throw new Error(`Phiếu nhập #${id} không tồn tại`)
    if (invoice.status !== 'nhap') {
      throw new Error('Chỉ có thể xóa phiếu nhập ở trạng thái nháp')
    }

    sqlite.transaction(() => {
      sqlite
        .prepare('DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = ?')
        .run(id)
      sqlite
        .prepare('DELETE FROM purchase_invoices WHERE id = ?')
        .run(id)
    })()
  }

  async checkDuplicateInvoiceNumber(
    supplierId: number,
    invoiceNumber: string,
    excludeId?: number
  ): Promise<boolean> {
    const db = getDb()
    const conditions = [
      eq(purchaseInvoices.supplierId, supplierId),
      sql`trim(${purchaseInvoices.invoiceNumber}) = ${invoiceNumber.trim()}`,
      ne(purchaseInvoices.status, 'huy'),
    ]

    if (excludeId) {
      conditions.push(ne(purchaseInvoices.id, excludeId))
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseInvoices)
      .where(and(...conditions))

    return result.count > 0
  }

  async createPayment(input: CreateSupplierPaymentInput) {
    const sqlite = getSqlite()

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

    const payFn = sqlite.transaction(() => {
      if (!Number.isInteger(input.amount) || input.amount <= 0) {
        throw new Error('Số tiền thanh toán phải là số nguyên lớn hơn 0')
      }
      const invoice = sqlite.prepare(
        'SELECT status, grand_total FROM purchase_invoices WHERE id = ?'
      ).get(input.purchaseInvoiceId) as { status: string; grand_total: number } | undefined
      if (!invoice) throw new Error('Phiếu nhập không tồn tại')
      if (invoice.status !== 'xac_nhan') {
        throw new Error('Chỉ có thể thanh toán phiếu đã xác nhận')
      }
      const paid = sqlite.prepare(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM supplier_payments WHERE purchase_invoice_id = ?'
      ).get(input.purchaseInvoiceId) as { total: number }
      if (paid.total + input.amount > invoice.grand_total) {
        throw new Error('Số tiền thanh toán vượt quá số tiền còn lại')
      }
      sqlite
        .prepare(`
          INSERT INTO supplier_payments (purchase_invoice_id, payment_date, amount, payment_method, transaction_reference, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          input.purchaseInvoiceId,
          input.paymentDate,
          input.amount,
          input.paymentMethod,
          input.transactionReference ?? null,
          input.notes ?? null,
          now
        )

      // Update paid_amount and remaining_amount on the invoice
      sqlite
        .prepare(`
          UPDATE purchase_invoices
          SET paid_amount = ?,
              remaining_amount = ?,
              payment_status = ?
          WHERE id = ?
        `)
        .run(
          paid.total + input.amount,
          invoice.grand_total - paid.total - input.amount,
          paid.total + input.amount === invoice.grand_total ? 'da_thanh_toan' : 'thanh_toan_mot_phan',
          input.purchaseInvoiceId
        )
    })

    payFn()
    return this.getPayments(input.purchaseInvoiceId)
  }

  async getPayments(purchaseInvoiceId: number) {
    const db = getDb()
    return db
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.purchaseInvoiceId, purchaseInvoiceId))
      .orderBy(desc(supplierPayments.paymentDate))
  }

  private mapToDTO(
    invoice: typeof purchaseInvoices.$inferSelect,
    supplierName: string,
    items: { item: typeof purchaseInvoiceItems.$inferSelect; productCode: string; productName: string; inventoryUnit: string }[]
  ): PurchaseInvoiceDTO {
    return {
      id: invoice.id,
      receiptCode: invoice.receiptCode,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      receivedDate: invoice.receivedDate,
      supplierId: invoice.supplierId,
      supplierName,
      subtotal: invoice.subtotal,
      discountAmount: invoice.discountAmount,
      taxAmount: invoice.taxAmount,
      shippingCost: invoice.shippingCost,
      shippingAllocationMethod: invoice.shippingAllocationMethod as PurchaseInvoiceDTO['shippingAllocationMethod'],
      grandTotal: invoice.grandTotal,
      paidAmount: invoice.paidAmount,
      remainingAmount: invoice.remainingAmount,
      paymentStatus: invoice.paymentStatus as PurchaseInvoiceDTO['paymentStatus'],
      paymentMethod: invoice.paymentMethod as PurchaseInvoiceDTO['paymentMethod'],
      status: invoice.status as PurchaseInvoiceDTO['status'],
      notes: invoice.notes,
      createdAt: invoice.createdAt,
      confirmedAt: invoice.confirmedAt,
      cancelledAt: invoice.cancelledAt,
      items: items.map((i) => ({
        id: i.item.id,
        purchaseInvoiceId: i.item.purchaseInvoiceId,
        productId: i.item.productId,
        productCode: i.productCode,
        productName: i.productName,
        inventoryUnit: i.inventoryUnit,
        quantity: i.item.quantity,
        invoiceUnitPrice: i.item.invoiceUnitPrice,
        discountAmount: i.item.discountAmount,
        shippingAllocation: i.item.shippingAllocation,
        effectiveUnitCost: i.item.effectiveUnitCost,
        lineTotal: i.item.lineTotal,
        notes: i.item.notes,
      })),
    }
  }
}

let _instance: PurchaseRepository | null = null

export function getPurchaseRepository(): PurchaseRepository {
  if (!_instance) _instance = new PurchaseRepository()
  return _instance
}
