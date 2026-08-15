import { eq, and, sql, desc, asc, type SQL } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/connection'
import { products, inventoryTransactions, purchaseInvoiceItems, salesInvoiceItems } from '../db/schema'
import type {
  ProductDTO,
  ProductListParams,
  PaginatedResult,
} from '../../shared/ipc-types'
import type {
  CreateProductInput,
  UpdateProductInput,
} from '../../shared/schemas'

function mapToDTO(row: typeof products.$inferSelect): ProductDTO {
  return {
    id: row.id,
    productCode: row.productCode,
    productName: row.productName,
    animalCategory: row.animalCategory as ProductDTO['animalCategory'],
    packageWeightGrams: row.packageWeightGrams,
    packageWeightUnit: row.packageWeightUnit,
    inventoryUnit: row.inventoryUnit as ProductDTO['inventoryUnit'],
    brand: row.brand,
    latestPurchasePrice: row.latestPurchasePrice,
    averageCost: row.averageCost,
    currentSalePrice: row.currentSalePrice,
    currentStock: row.currentStock,
    active: row.active,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

class ProductRepository {
  async list(params: ProductListParams): Promise<PaginatedResult<ProductDTO>> {
    const db = getDb()
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 50

    const conditions: SQL[] = []

    if (params.search) {
      const searchTerm = `%${params.search}%`
      conditions.push(
        sql`(${products.productCode} LIKE ${searchTerm} OR ${products.productName} LIKE ${searchTerm})`
      )
    }

    if (params.animalCategory) {
      conditions.push(eq(products.animalCategory, params.animalCategory))
    }

    if (params.inventoryUnit) {
      conditions.push(eq(products.inventoryUnit, params.inventoryUnit))
    }

    if (params.activeOnly !== false) {
      // Default: show only active
      conditions.push(eq(products.active, true))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(whereClause)

    const items = await db
      .select()
      .from(products)
      .where(whereClause)
      .orderBy(asc(products.productCode))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return {
      items: items.map(mapToDTO),
      total: countResult.count,
      page,
      pageSize,
    }
  }

  async getById(id: number): Promise<ProductDTO> {
    const db = getDb()
    const [row] = await db.select().from(products).where(eq(products.id, id))
    if (!row) throw new Error(`Sản phẩm #${id} không tồn tại`)
    return mapToDTO(row)
  }

  async getByCode(productCode: string): Promise<ProductDTO | null> {
    const db = getDb()
    const [row] = await db
      .select()
      .from(products)
      .where(eq(products.productCode, productCode))
    return row ? mapToDTO(row) : null
  }

  async create(input: CreateProductInput): Promise<ProductDTO> {
    const db = getDb()

    // Check unique product code
    const existing = await this.getByCode(input.productCode)
    if (existing) {
      throw new Error(`Mã sản phẩm "${input.productCode}" đã tồn tại`)
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
    const [row] = await db
      .insert(products)
      .values({
        productCode: input.productCode,
        productName: input.productName,
        animalCategory: input.animalCategory,
        packageWeightGrams: input.packageWeightGrams,
        packageWeightUnit: input.packageWeightUnit ?? 'kg',
        inventoryUnit: input.inventoryUnit,
        brand: input.brand ?? null,
        latestPurchasePrice: 0,
        averageCost: 0,
        currentSalePrice: input.currentSalePrice,
        currentStock: 0,
        active: true,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    return mapToDTO(row)
  }

  async update(input: UpdateProductInput): Promise<ProductDTO> {
    const current = await this.getById(input.id)

    // If product code is changing, check uniqueness
    if (input.productCode && input.productCode !== current.productCode) {
      const existing = await this.getByCode(input.productCode)
      if (existing && existing.id !== input.id) {
        throw new Error(`Mã sản phẩm "${input.productCode}" đã tồn tại`)
      }
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
    const sqlite = getSqlite()
    sqlite.transaction(() => {
      sqlite.prepare(`UPDATE products SET product_code=?,product_name=?,animal_category=?,
        package_weight_grams=?,package_weight_unit=?,inventory_unit=?,brand=?,
        current_sale_price=?,notes=?,updated_at=? WHERE id=?`).run(
        input.productCode ?? current.productCode, input.productName ?? current.productName,
        input.animalCategory ?? current.animalCategory, input.packageWeightGrams ?? current.packageWeightGrams,
        input.packageWeightUnit ?? current.packageWeightUnit, input.inventoryUnit ?? current.inventoryUnit,
        input.brand ?? current.brand, input.currentSalePrice ?? current.currentSalePrice,
        input.notes ?? current.notes, now, input.id)
      if (input.currentSalePrice !== undefined && input.currentSalePrice !== current.currentSalePrice) {
        sqlite.prepare(`INSERT INTO product_price_history
          (product_id,price_type,old_price,new_price,changed_at,reason)
          VALUES (?,'sale_price',?,?,?,?)`).run(
          input.id, current.currentSalePrice, input.currentSalePrice, now, 'Cập nhật giá bán')
      }
    })()
    return await this.getById(input.id)
  }

  async toggleActive(id: number): Promise<ProductDTO> {
    const db = getDb()
    const current = await this.getById(id)
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

    const [row] = await db
      .update(products)
      .set({ active: !current.active, updatedAt: now })
      .where(eq(products.id, id))
      .returning()

    return mapToDTO(row)
  }

  async safeDelete(id: number): Promise<void> {
    const db = getDb()

    // Check if product has any transactions
    const [txCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.productId, id))

    if (txCount.count > 0) {
      throw new Error(
        'Sản phẩm này đã có giao dịch nhập/xuất. Không thể xóa — chỉ có thể ngừng kinh doanh.'
      )
    }

    // Check purchase invoice items
    const [purchaseItemCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseInvoiceItems)
      .where(eq(purchaseInvoiceItems.productId, id))

    if (purchaseItemCount.count > 0) {
      throw new Error(
        'Sản phẩm này đã có trong phiếu nhập hàng. Không thể xóa — chỉ có thể ngừng kinh doanh.'
      )
    }

    // Check sales invoice items
    const [saleItemCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(salesInvoiceItems)
      .where(eq(salesInvoiceItems.productId, id))

    if (saleItemCount.count > 0) {
      throw new Error(
        'Sản phẩm này đã có trong phiếu xuất hàng. Không thể xóa — chỉ có thể ngừng kinh doanh.'
      )
    }

    await db.delete(products).where(eq(products.id, id))
  }

  async getHistory(id: number, _params?: Record<string, unknown>) {
    const db = getDb()
    return db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.productId, id))
      .orderBy(desc(inventoryTransactions.transactionDate))
      .limit(100)
  }
}

let _instance: ProductRepository | null = null

export function getProductRepository(): ProductRepository {
  if (!_instance) _instance = new ProductRepository()
  return _instance
}
