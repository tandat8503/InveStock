import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDb, teardownTestDb } from '../helpers/testDatabase'
import { getSupplierRepository } from '../../electron/repositories/supplierRepository'
import { getDb } from '../../electron/db/connection'
import { purchaseInvoices, supplierPayments } from '../../electron/db/schema'

describe('SupplierRepository', () => {
  beforeEach(() => {
    setupTestDb()
  })

  afterEach(() => {
    teardownTestDb()
  })

  it('tạo nhà cung cấp thành công', async () => {
    const repo = getSupplierRepository()
    const supplier = await repo.create({
      companyName: 'Công ty Cám CP',
      phone: '0987654321',
      address: 'Đồng Nai',
      taxCode: 'TAX123',
      contactPerson: 'Nguyễn Văn A',
      bankAccount: '1234567890',
      notes: 'Nhà cung cấp chính',
    })

    expect(supplier.id).toBeDefined()
    expect(supplier.companyName).toBe('Công ty Cám CP')
    expect(supplier.phone).toBe('0987654321')
    expect(supplier.active).toBe(true)
  })

  it('cập nhật nhà cung cấp', async () => {
    const repo = getSupplierRepository()
    const supplier = await repo.create({
      companyName: 'Công ty Cám CP',
      phone: '0987654321',
    })

    const updated = await repo.update({
      id: supplier.id,
      companyName: 'Công ty CP Việt Nam',
      phone: '0123456789',
    })

    expect(updated.companyName).toBe('Công ty CP Việt Nam')
    expect(updated.phone).toBe('0123456789')
  })

  it('toggle active', async () => {
    const repo = getSupplierRepository()
    const supplier = await repo.create({
      companyName: 'Công ty Cám CP',
    })

    expect(supplier.active).toBe(true)

    const inactive = await repo.toggleActive(supplier.id)
    expect(inactive.active).toBe(false)

    const activeAgain = await repo.toggleActive(supplier.id)
    expect(activeAgain.active).toBe(true)
  })

  it('cho phép xóa nhà cung cấp chưa có hóa đơn', async () => {
    const repo = getSupplierRepository()
    const supplier = await repo.create({
      companyName: 'Công ty Cám CP',
    })

    await expect(repo.safeDelete(supplier.id)).resolves.not.toThrow()
    await expect(repo.getById(supplier.id)).rejects.toThrow()
  })

  it('không cho xóa nhà cung cấp đã có purchase invoice', async () => {
    const repo = getSupplierRepository()
    const supplier = await repo.create({
      companyName: 'Công ty Cám CP',
    })

    const db = getDb()
    await db.insert(purchaseInvoices).values({
      receiptCode: 'PN001',
      invoiceNumber: 'INV001',
      invoiceDate: '2026-07-27',
      receivedDate: '2026-07-27',
      supplierId: supplier.id,
    })

    await expect(repo.safeDelete(supplier.id)).rejects.toThrow('Nhà cung cấp này đã có hóa đơn. Không thể xóa')
  })

  it('tính toán totalPurchased, totalPaid, totalDebt (remainingAmount) chính xác', async () => {
    const repo = getSupplierRepository()
    const supplier = await repo.create({
      companyName: 'Công ty Cám CP',
    })

    const db = getDb()
    
    // Create verified purchase invoices
    // Only "xac_nhan" (confirmed) status invoices count towards totalPurchased
    const [inv1] = await db.insert(purchaseInvoices).values({
      receiptCode: 'PN001',
      invoiceNumber: 'INV001',
      invoiceDate: '2026-07-27',
      receivedDate: '2026-07-27',
      supplierId: supplier.id,
      grandTotal: 10000000, // 10M
      status: 'xac_nhan',
    }).returning()

    const [inv2] = await db.insert(purchaseInvoices).values({
      receiptCode: 'PN002',
      invoiceNumber: 'INV002',
      invoiceDate: '2026-07-27',
      receivedDate: '2026-07-27',
      supplierId: supplier.id,
      grandTotal: 5000000, // 5M
      status: 'xac_nhan',
    }).returning()

    // Invoice not confirmed - shouldn't count
    await db.insert(purchaseInvoices).values({
      receiptCode: 'PN003',
      invoiceNumber: 'INV003',
      invoiceDate: '2026-07-27',
      receivedDate: '2026-07-27',
      supplierId: supplier.id,
      grandTotal: 3000000,
      status: 'nhap',
    })

    // Payments
    await db.insert(supplierPayments).values({
      purchaseInvoiceId: inv1.id,
      paymentDate: '2026-07-27',
      amount: 4000000, // 4M
    })

    await db.insert(supplierPayments).values({
      purchaseInvoiceId: inv2.id,
      paymentDate: '2026-07-27',
      amount: 2000000, // 2M
    })

    const stats = await repo.getWithStats(supplier.id)
    
    expect(stats.totalPurchased).toBe(15000000) // 10M + 5M
    expect(stats.totalPaid).toBe(6000000) // 4M + 2M
    expect(stats.totalDebt).toBe(9000000) // 15M - 6M
  })

  it('danh sách hóa đơn và lịch sử thanh toán đúng', async () => {
    const repo = getSupplierRepository()
    const supplier = await repo.create({
      companyName: 'Công ty Cám CP',
    })

    const db = getDb()
    const [inv] = await db.insert(purchaseInvoices).values({
      receiptCode: 'PN001',
      invoiceNumber: 'INV001',
      invoiceDate: '2026-07-27',
      receivedDate: '2026-07-27',
      supplierId: supplier.id,
      grandTotal: 10000000,
      status: 'xac_nhan',
    }).returning()

    await db.insert(supplierPayments).values({
      purchaseInvoiceId: inv.id,
      paymentDate: '2026-07-27',
      amount: 5000000,
    })

    const invoices = await repo.getInvoices(supplier.id)
    expect(invoices.length).toBe(1)
    expect(invoices[0].receiptCode).toBe('PN001')

    const payments = await repo.getPayments(supplier.id)
    expect(payments.length).toBe(1)
    expect(payments[0].amount).toBe(5000000)
    expect(payments[0].invoiceNumber).toBe('INV001')
  })

  it('tìm kiếm theo companyName, phone, taxCode', async () => {
    const repo = getSupplierRepository()
    await repo.create({
      companyName: 'Công ty Cám CP',
      phone: '0987654321',
      taxCode: 'TAX111',
    })

    await repo.create({
      companyName: 'Đại lý Thành Công',
      phone: '0911223344',
      taxCode: 'TAX222',
    })

    // Search by companyName
    const searchName = await repo.list({ search: 'CP' })
    expect(searchName.total).toBe(1)
    expect(searchName.items[0].companyName).toBe('Công ty Cám CP')

    // Search by phone
    const searchPhone = await repo.list({ search: '0911' })
    expect(searchPhone.total).toBe(1)
    expect(searchPhone.items[0].companyName).toBe('Đại lý Thành Công')

    // Search by taxCode
    const searchTax = await repo.list({ search: 'TAX222' })
    expect(searchTax.total).toBe(1)
    expect(searchTax.items[0].companyName).toBe('Đại lý Thành Công')
  })
})
