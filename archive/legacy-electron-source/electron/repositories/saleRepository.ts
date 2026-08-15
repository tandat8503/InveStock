import { type SQL, eq, sql, desc, and } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/connection'
import { salesInvoices, salesInvoiceItems, products } from '../db/schema'
import type { SalesInvoiceDTO, PaginatedResult } from '../../shared/ipc-types'
import type {
  CreateSalesInvoiceInput,
  UpdateSalesInvoiceInput,
} from '../../shared/schemas'

function normalizeInvoiceNumber(value?: string | null): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

interface CalculatedSaleItem {
  productId: number
  quantity: number
  unitSalePrice: number
  unitCostAtSale: number
  lineRevenue: number
  lineCost: number
  estimatedProfit: number
}

function calculateDraftItems(
  sqlite: ReturnType<typeof getSqlite>,
  items: CreateSalesInvoiceInput['items']
): CalculatedSaleItem[] {
  const productIds = new Set<number>()
  return items.map((item) => {
    if (productIds.has(item.productId)) throw new Error('Sản phẩm không được trùng trong cùng phiếu')
    productIds.add(item.productId)
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('Số lượng phải là số nguyên lớn hơn 0')
    if (!Number.isInteger(item.unitSalePrice) || item.unitSalePrice < 0) throw new Error('Giá bán phải là số nguyên không âm')
    const product = sqlite.prepare(
      'SELECT active, average_cost FROM products WHERE id = ?'
    ).get(item.productId) as { active: number; average_cost: number } | undefined
    if (!product) throw new Error(`Sản phẩm #${item.productId} không tồn tại`)
    if (!product.active) throw new Error(`Sản phẩm #${item.productId} đã ngừng kinh doanh`)
    const lineRevenue = item.quantity * item.unitSalePrice
    const lineCost = item.quantity * product.average_cost
    return {
      ...item,
      unitCostAtSale: product.average_cost,
      lineRevenue,
      lineCost,
      estimatedProfit: lineRevenue - lineCost,
    }
  })
}

class SaleRepository {
  async list(params: Record<string, unknown>): Promise<PaginatedResult<SalesInvoiceDTO>> {
    const db = getDb()
    const page = (params.page as number) ?? 1
    const pageSize = (params.pageSize as number) ?? 20

    const conditions: SQL[] = []

    if (params.search) {
      const searchTerm = `%${params.search as string}%`
      conditions.push(
        sql`(${salesInvoices.electronicInvoiceNumber} LIKE ${searchTerm} OR ${salesInvoices.issueCode} LIKE ${searchTerm} OR ${salesInvoices.buyerName} LIKE ${searchTerm})`
      )
    }

    if (params.status) {
      conditions.push(eq(salesInvoices.status, params.status as string))
    }

    if (params.buyerType) {
      conditions.push(eq(salesInvoices.buyerType, params.buyerType as string))
    }

    if (params.dateFrom) {
      conditions.push(sql`${salesInvoices.invoiceDate} >= ${params.dateFrom}`)
    }

    if (params.dateTo) {
      conditions.push(sql`${salesInvoices.invoiceDate} <= ${params.dateTo}`)
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(salesInvoices)
      .where(whereClause)

    const rows = await db
      .select()
      .from(salesInvoices)
      .where(whereClause)
      .orderBy(desc(salesInvoices.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return {
      items: rows.map((r) => this.mapToDTO(r, [])),
      total: countResult.count,
      page,
      pageSize,
    }
  }

  async getById(id: number): Promise<SalesInvoiceDTO> {
    const db = getDb()
    const [invoice] = await db
      .select()
      .from(salesInvoices)
      .where(eq(salesInvoices.id, id))

    if (!invoice) throw new Error(`Phiếu xuất #${id} không tồn tại`)

    const items = await db
      .select({
        item: salesInvoiceItems,
        productCode: products.productCode,
        productName: products.productName,
        inventoryUnit: products.inventoryUnit,
        currentStock: products.currentStock,
      })
      .from(salesInvoiceItems)
      .innerJoin(products, eq(salesInvoiceItems.productId, products.id))
      .where(eq(salesInvoiceItems.salesInvoiceId, id))

    return this.mapToDTO(invoice, items)
  }

  async create(input: CreateSalesInvoiceInput): Promise<SalesInvoiceDTO> {
    const sqlite = getSqlite()
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
    const electronicNumber = normalizeInvoiceNumber(input.electronicInvoiceNumber)

    const insertFn = sqlite.transaction(() => {
      const items = calculateDraftItems(sqlite, input.items)
      if (electronicNumber) {
        const duplicate = sqlite.prepare(
          'SELECT 1 FROM sales_invoices WHERE electronic_invoice_number = ?'
        ).get(electronicNumber)
        if (duplicate) throw new Error('Số hóa đơn điện tử đã tồn tại')
      }
      sqlite.prepare(
        "INSERT OR IGNORE INTO app_counters (name, value) VALUES ('sales_issue_code', 0)"
      ).run()
      sqlite.prepare(
        "UPDATE app_counters SET value = value + 1 WHERE name = 'sales_issue_code'"
      ).run()
      const counter = sqlite.prepare(
        "SELECT value FROM app_counters WHERE name = 'sales_issue_code'"
      ).get() as { value: number }
      const issueCode = `PX${counter.value.toString().padStart(6, '0')}`
      const subtotal = items.reduce((sum, item) => sum + item.lineRevenue, 0)
      const totalCost = items.reduce((sum, item) => sum + item.lineCost, 0)
      const estimatedProfit = subtotal - totalCost
      const [invoice] = sqlite
        .prepare(`
          INSERT INTO sales_invoices (
            issue_code, electronic_invoice_number, invoice_date, buyer_type, buyer_name,
            subtotal, grand_total, total_cost, estimated_profit, status, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'nhap', ?, ?)
          RETURNING *
        `)
        .all(
          issueCode,
          electronicNumber,
          input.invoiceDate,
          input.buyerType,
          input.buyerName ?? null,
          subtotal,
          subtotal,
          totalCost,
          estimatedProfit,
          input.notes ?? null,
          now
        ) as (typeof salesInvoices.$inferSelect)[]

      for (const item of items) {
        sqlite
          .prepare(`
            INSERT INTO sales_invoice_items (
              sales_invoice_id, product_id, quantity, unit_sale_price, unit_cost_at_sale,
              line_revenue, line_cost, estimated_profit
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            invoice.id,
            item.productId,
            item.quantity,
            item.unitSalePrice,
            item.unitCostAtSale,
            item.lineRevenue,
            item.lineCost,
            item.estimatedProfit
          )
      }

      return invoice
    })

    const created = insertFn()
    return this.getById(created.id)
  }

  async update(input: UpdateSalesInvoiceInput): Promise<SalesInvoiceDTO> {
    const sqlite = getSqlite()
    const current = await this.getById(input.id)

    if (current.status !== 'nhap') {
      throw new Error('Chỉ có thể sửa phiếu xuất ở trạng thái nháp')
    }

    const updateFn = sqlite.transaction(() => {
      const electronicNumber = input.electronicInvoiceNumber === undefined
        ? current.electronicInvoiceNumber
        : normalizeInvoiceNumber(input.electronicInvoiceNumber)
      if (electronicNumber) {
        const duplicate = sqlite.prepare(
          'SELECT 1 FROM sales_invoices WHERE electronic_invoice_number = ? AND id <> ?'
        ).get(electronicNumber, input.id)
        if (duplicate) throw new Error('Số hóa đơn điện tử đã tồn tại')
      }
      const rawItems = input.items ?? current.items.map((item) => ({
        productId: item.productId, quantity: item.quantity, unitSalePrice: item.unitSalePrice,
      }))
      const items = calculateDraftItems(sqlite, rawItems)
      const subtotal = items.reduce((sum, i) => sum + i.lineRevenue, 0)
      const grandTotal = subtotal
      const totalCost = items.reduce((sum, i) => sum + (i.lineCost ?? 0), 0)
      const estimatedProfit = grandTotal - totalCost

      sqlite
        .prepare(`
          UPDATE sales_invoices SET
            electronic_invoice_number = ?, invoice_date = ?, buyer_type = ?, buyer_name = ?,
            subtotal = ?, grand_total = ?, total_cost = ?, estimated_profit = ?, notes = ?
          WHERE id = ?
        `)
        .run(
          electronicNumber,
          input.invoiceDate ?? current.invoiceDate,
          input.buyerType ?? current.buyerType,
          input.buyerName ?? current.buyerName,
          subtotal,
          grandTotal,
          totalCost,
          estimatedProfit,
          input.notes ?? current.notes,
          input.id
        )

      if (input.items) {
        sqlite
          .prepare('DELETE FROM sales_invoice_items WHERE sales_invoice_id = ?')
          .run(input.id)

        for (const item of items) {
          sqlite
            .prepare(`
              INSERT INTO sales_invoice_items (
                sales_invoice_id, product_id, quantity, unit_sale_price, unit_cost_at_sale,
                line_revenue, line_cost, estimated_profit
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              input.id,
              item.productId,
              item.quantity,
              item.unitSalePrice,
              item.unitCostAtSale,
              item.lineRevenue,
              item.lineCost,
              item.estimatedProfit
            )
        }
      }
    })

    updateFn()
    return this.getById(input.id)
  }

  async deleteDraft(id: number): Promise<void> {
    const sqlite = getSqlite()
    const db = getDb()

    const [invoice] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, id))
    if (!invoice) throw new Error(`Phiếu xuất #${id} không tồn tại`)
    if (invoice.status !== 'nhap') {
      throw new Error('Chỉ có thể xóa phiếu xuất ở trạng thái nháp')
    }

    sqlite.transaction(() => {
      sqlite.prepare('DELETE FROM sales_invoice_items WHERE sales_invoice_id = ?').run(id)
      sqlite.prepare('DELETE FROM sales_invoices WHERE id = ?').run(id)
    })()
  }

  private mapToDTO(
    invoice: typeof salesInvoices.$inferSelect,
    items: {
      item: typeof salesInvoiceItems.$inferSelect
      productCode: string
      productName: string
      inventoryUnit: string
      currentStock: number
    }[]
  ): SalesInvoiceDTO {
    return {
      id: invoice.id,
      issueCode: invoice.issueCode,
      electronicInvoiceNumber: invoice.electronicInvoiceNumber,
      invoiceDate: invoice.invoiceDate,
      buyerType: invoice.buyerType as SalesInvoiceDTO['buyerType'],
      buyerName: invoice.buyerName,
      subtotal: invoice.subtotal,
      grandTotal: invoice.grandTotal,
      totalCost: invoice.totalCost,
      estimatedProfit: invoice.estimatedProfit,
      status: invoice.status as SalesInvoiceDTO['status'],
      notes: invoice.notes,
      createdAt: invoice.createdAt,
      confirmedAt: invoice.confirmedAt,
      cancelledAt: invoice.cancelledAt,
      cancellationReason: invoice.cancellationReason,
      items: items.map((i) => ({
        id: i.item.id,
        salesInvoiceId: i.item.salesInvoiceId,
        productId: i.item.productId,
        productCode: i.productCode,
        productName: i.productName,
        inventoryUnit: i.inventoryUnit,
        currentStock: i.currentStock,
        quantity: i.item.quantity,
        unitSalePrice: i.item.unitSalePrice,
        unitCostAtSale: i.item.unitCostAtSale,
        lineRevenue: i.item.lineRevenue,
        lineCost: i.item.lineCost,
        estimatedProfit: i.item.estimatedProfit,
      })),
    }
  }
}

let _instance: SaleRepository | null = null

export function getSaleRepository(): SaleRepository {
  if (!_instance) _instance = new SaleRepository()
  return _instance
}
