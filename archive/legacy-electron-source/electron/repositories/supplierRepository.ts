import { type SQL, eq, and, sql, desc, asc } from 'drizzle-orm'
import { getDb } from '../db/connection'
import {
  suppliers,
  purchaseInvoices,
  supplierPayments,
} from '../db/schema'
import type { SupplierDTO, PaginatedResult } from '../../shared/ipc-types'
import type { CreateSupplierInput, UpdateSupplierInput } from '../../shared/schemas'

function mapToDTO(row: typeof suppliers.$inferSelect, stats?: {
  totalPurchased: number
  totalPaid: number
  totalDebt: number
}): SupplierDTO {
  return {
    id: row.id,
    supplierCode: `NCC${row.id.toString().padStart(4, '0')}`,
    companyName: row.companyName,
    phone: row.phone,
    address: row.address,
    taxCode: row.taxCode,
    contactPerson: row.contactPerson,
    bankAccount: row.bankAccount,
    notes: row.notes,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    totalPurchased: stats?.totalPurchased,
    totalPaid: stats?.totalPaid,
    totalDebt: stats?.totalDebt,
  }
}

class SupplierRepository {
  async list(params: { search?: string; activeOnly?: boolean }): Promise<PaginatedResult<SupplierDTO>> {
    const db = getDb()
    const conditions: SQL[] = []

    if (params.search) {
      const searchTerm = `%${params.search}%`
      conditions.push(
        sql`(${suppliers.companyName} LIKE ${searchTerm} OR ${suppliers.phone} LIKE ${searchTerm} OR ${suppliers.address} LIKE ${searchTerm} OR ${suppliers.taxCode} LIKE ${searchTerm})`
      )
    }

    if (params.activeOnly !== false) {
      conditions.push(eq(suppliers.active, true))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(suppliers)
      .where(whereClause)

    const items = await db
      .select()
      .from(suppliers)
      .where(whereClause)
      .orderBy(asc(suppliers.companyName))

    return {
      items: items.map((row) => mapToDTO(row)),
      total: countResult.count,
      page: 1,
      pageSize: 1000,
    }
  }

  async getById(id: number): Promise<SupplierDTO> {
    const db = getDb()
    const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id))
    if (!row) throw new Error(`Nhà cung cấp #${id} không tồn tại`)
    return mapToDTO(row)
  }

  async getWithStats(id: number): Promise<SupplierDTO> {
    const db = getDb()
    const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id))
    if (!row) throw new Error(`Nhà cung cấp #${id} không tồn tại`)

    // Calculate total purchased (from confirmed invoices)
    const [purchaseStats] = await db
      .select({
        totalPurchased: sql<number>`COALESCE(SUM(grand_total), 0)`,
      })
      .from(purchaseInvoices)
      .where(
        and(
          eq(purchaseInvoices.supplierId, id),
          eq(purchaseInvoices.status, 'xac_nhan')
        )
      )

    // Calculate total paid (from payments)
    const [paymentStats] = await db
      .select({
        totalPaid: sql<number>`COALESCE(SUM(supplier_payments.amount), 0)`,
      })
      .from(supplierPayments)
      .innerJoin(purchaseInvoices, eq(supplierPayments.purchaseInvoiceId, purchaseInvoices.id))
      .where(eq(purchaseInvoices.supplierId, id))

    const totalPurchased = purchaseStats.totalPurchased
    const totalPaid = paymentStats.totalPaid
    const totalDebt = totalPurchased - totalPaid

    return mapToDTO(row, { totalPurchased, totalPaid, totalDebt })
  }

  async create(input: CreateSupplierInput): Promise<SupplierDTO> {
    const db = getDb()
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

    const [row] = await db
      .insert(suppliers)
      .values({
        companyName: input.companyName,
        phone: input.phone ?? null,
        address: input.address ?? null,
        taxCode: input.taxCode ?? null,
        contactPerson: input.contactPerson ?? null,
        bankAccount: input.bankAccount ?? null,
        notes: input.notes ?? null,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    return mapToDTO(row)
  }

  async update(input: UpdateSupplierInput): Promise<SupplierDTO> {
    const db = getDb()
    await this.getById(input.id)

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
    const updateData: Partial<typeof suppliers.$inferInsert> = { updatedAt: now }

    if (input.companyName !== undefined) updateData.companyName = input.companyName
    if (input.phone !== undefined) updateData.phone = input.phone ?? null
    if (input.address !== undefined) updateData.address = input.address ?? null
    if (input.taxCode !== undefined) updateData.taxCode = input.taxCode ?? null
    if (input.contactPerson !== undefined) updateData.contactPerson = input.contactPerson ?? null
    if (input.bankAccount !== undefined) updateData.bankAccount = input.bankAccount ?? null
    if (input.notes !== undefined) updateData.notes = input.notes ?? null

    const [row] = await db
      .update(suppliers)
      .set(updateData)
      .where(eq(suppliers.id, input.id))
      .returning()

    return mapToDTO(row)
  }

  async safeDelete(id: number): Promise<void> {
    const db = getDb()

    const [invoiceCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.supplierId, id))

    if (invoiceCount.count > 0) {
      throw new Error(
        'Nhà cung cấp này đã có hóa đơn. Không thể xóa — chỉ có thể chuyển sang ngừng sử dụng.'
      )
    }

    await db.delete(suppliers).where(eq(suppliers.id, id))
  }

  async toggleActive(id: number): Promise<SupplierDTO> {
    const db = getDb()
    const current = await this.getById(id)
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

    const [row] = await db
      .update(suppliers)
      .set({ active: !current.active, updatedAt: now })
      .where(eq(suppliers.id, id))
      .returning()

    return mapToDTO(row)
  }

  async getInvoices(id: number, _params?: Record<string, unknown>) {
    const db = getDb()
    return db
      .select()
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.supplierId, id))
      .orderBy(desc(purchaseInvoices.invoiceDate))
  }

  async getPayments(supplierId: number) {
    const db = getDb()
    return db
      .select({
        id: supplierPayments.id,
        purchaseInvoiceId: supplierPayments.purchaseInvoiceId,
        receiptCode: purchaseInvoices.receiptCode,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        paymentDate: supplierPayments.paymentDate,
        amount: supplierPayments.amount,
        paymentMethod: supplierPayments.paymentMethod,
        transactionReference: supplierPayments.transactionReference,
        notes: supplierPayments.notes,
        createdAt: supplierPayments.createdAt,
      })
      .from(supplierPayments)
      .innerJoin(purchaseInvoices, eq(supplierPayments.purchaseInvoiceId, purchaseInvoices.id))
      .where(eq(purchaseInvoices.supplierId, supplierId))
      .orderBy(desc(supplierPayments.paymentDate))
  }
}

let _instance: SupplierRepository | null = null

export function getSupplierRepository(): SupplierRepository {
  if (!_instance) _instance = new SupplierRepository()
  return _instance
}
