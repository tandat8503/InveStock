import { type SQL, eq, sql, desc, and } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/connection'
import { inventoryTransactions, products } from '../db/schema'
import type { InventoryTransactionDTO, InventorySummaryDTO } from '../../shared/ipc-types'

class InventoryRepository {
  async getSummary(params: Record<string, unknown>): Promise<InventorySummaryDTO[]> {
    const db = getDb()

    // For each product, calculate opening stock, total in, total out, closing stock
    const allProducts = await db
      .select({
        id: products.id,
        productCode: products.productCode,
        productName: products.productName,
        animalCategory: products.animalCategory,
        inventoryUnit: products.inventoryUnit,
        currentStock: products.currentStock,
        averageCost: products.averageCost,
      })
      .from(products)
      .where(eq(products.active, true))

    const results: InventorySummaryDTO[] = []

    for (const product of allProducts) {
      const txConditions = [eq(inventoryTransactions.productId, product.id)]

      if (params.dateFrom) {
        txConditions.push(sql`${inventoryTransactions.transactionDate} >= ${params.dateFrom}`)
      }

      if (params.dateTo) {
        txConditions.push(sql`${inventoryTransactions.transactionDate} <= ${params.dateTo}`)
      }

      const [stats] = await db
        .select({
          totalIn: sql<number>`COALESCE(SUM(quantity_in), 0)`,
          totalOut: sql<number>`COALESCE(SUM(quantity_out), 0)`,
        })
        .from(inventoryTransactions)
        .where(and(...txConditions))

      const openingConditions = [eq(inventoryTransactions.productId, product.id)]
      if (params.dateFrom) openingConditions.push(
        sql`${inventoryTransactions.transactionDate} < ${params.dateFrom}`
      )
      const [opening] = await db.select({
        value: sql<number>`COALESCE(SUM(quantity_in - quantity_out), 0)`,
      }).from(inventoryTransactions).where(and(...openingConditions))
      const hasRange = Boolean(params.dateFrom || params.dateTo)
      const openingStock = params.dateFrom
        ? opening.value
        : hasRange
          ? 0
          : product.currentStock - stats.totalIn + stats.totalOut
      const closingStock = params.dateFrom || params.dateTo
        ? openingStock + stats.totalIn - stats.totalOut
        : product.currentStock
      const stockValue = closingStock * product.averageCost

      results.push({
        productId: product.id,
        productCode: product.productCode,
        productName: product.productName,
        animalCategory: product.animalCategory as InventorySummaryDTO['animalCategory'],
        inventoryUnit: product.inventoryUnit,
        openingStock,
        totalIn: stats.totalIn,
        totalOut: stats.totalOut,
        closingStock,
        averageCost: product.averageCost,
        stockValue,
      })
    }

    return results
  }

  async getTransactions(params: Record<string, unknown>) {
    const db = getDb()
    const page = (params.page as number) ?? 1
    const pageSize = (params.pageSize as number) ?? 50

    const conditions: SQL[] = []

    if (params.productId) {
      conditions.push(eq(inventoryTransactions.productId, params.productId as number))
    }

    if (params.dateFrom) {
      conditions.push(sql`${inventoryTransactions.transactionDate} >= ${params.dateFrom}`)
    }

    if (params.dateTo) {
      conditions.push(sql`${inventoryTransactions.transactionDate} <= ${params.dateTo}`)
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryTransactions)
      .where(whereClause)

    const rows = await db
      .select({
        tx: inventoryTransactions,
        productCode: products.productCode,
        productName: products.productName,
      })
      .from(inventoryTransactions)
      .innerJoin(products, eq(inventoryTransactions.productId, products.id))
      .where(whereClause)
      .orderBy(desc(inventoryTransactions.createdAt), desc(inventoryTransactions.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return {
      items: rows.map((r) => this.mapTransactionToDTO(r.tx, r.productCode, r.productName)),
      total: countResult.count,
      page,
      pageSize,
    }
  }

  async getProductHistory(productId: number, params?: Record<string, unknown>) {
    const db = getDb()
    const conditions = [eq(inventoryTransactions.productId, productId)]

    if (params?.dateFrom) {
      conditions.push(sql`${inventoryTransactions.transactionDate} >= ${params.dateFrom}`)
    }

    if (params?.dateTo) {
      conditions.push(sql`${inventoryTransactions.transactionDate} <= ${params.dateTo}`)
    }

    const [product] = await db.select().from(products).where(eq(products.id, productId))
    if (!product) throw new Error(`Sản phẩm #${productId} không tồn tại`)

    const rows = await db
      .select()
      .from(inventoryTransactions)
      .where(and(...conditions))
      .orderBy(desc(inventoryTransactions.createdAt), desc(inventoryTransactions.id))
      .limit(200)

    return rows.map((r) => this.mapTransactionToDTO(r, product.productCode, product.productName))
  }

  private mapTransactionToDTO(
    tx: typeof inventoryTransactions.$inferSelect,
    productCode: string,
    productName: string
  ): InventoryTransactionDTO {
    return {
      id: tx.id,
      transactionDate: tx.transactionDate,
      productId: tx.productId,
      productCode,
      productName,
      transactionType: tx.transactionType,
      sourceType: tx.sourceType,
      sourceId: tx.sourceId,
      quantityIn: tx.quantityIn,
      quantityOut: tx.quantityOut,
      unitCost: tx.unitCost,
      stockBefore: tx.stockBefore,
      stockAfter: tx.stockAfter,
      createdAt: tx.createdAt,
    }
  }

  checkConsistency(): { productId: number; currentStock: number; ledgerStock: number }[] {
    const rows = getSqlite().prepare(`SELECT p.id AS productId, p.current_stock AS currentStock,
      COALESCE(SUM(it.quantity_in - it.quantity_out), 0) AS ledgerStock
      FROM products p LEFT JOIN inventory_transactions it ON it.product_id = p.id
      GROUP BY p.id HAVING p.current_stock <> ledgerStock`).all() as {
      productId: number
      currentStock: number
      ledgerStock: number
    }[]
    return rows
  }
}

let _instance: InventoryRepository | null = null

export function getInventoryRepository(): InventoryRepository {
  if (!_instance) _instance = new InventoryRepository()
  return _instance
}
