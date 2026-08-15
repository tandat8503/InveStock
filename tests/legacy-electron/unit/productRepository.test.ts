import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDb, teardownTestDb } from '../helpers/testDatabase'
import { getProductRepository } from '../../electron/repositories/productRepository'
import { getDb } from '../../electron/db/connection'
import { inventoryTransactions, purchaseInvoiceItems, salesInvoiceItems, purchaseInvoices, salesInvoices, suppliers } from '../../electron/db/schema'

describe('ProductRepository', () => {
  beforeEach(() => {
    setupTestDb()
  })

  afterEach(() => {
    teardownTestDb()
  })

  it('tạo sản phẩm thành công', async () => {
    const repo = getProductRepository()
    const product = await repo.create({
      productCode: 'SP001',
      productName: 'Cám heo con',
      animalCategory: 'heo',
      packageWeightGrams: 25000,
      packageWeightUnit: 'kg',
      inventoryUnit: 'Bao',
      brand: 'Con Cò',
      currentSalePrice: 350000,
      notes: 'Thức ăn cho heo con',
    })

    expect(product.id).toBeDefined()
    expect(product.productCode).toBe('SP001')
    expect(product.productName).toBe('Cám heo con')
    expect(product.currentStock).toBe(0)
    expect(product.active).toBe(true)
  })

  it('không cho tạo productCode trùng', async () => {
    const repo = getProductRepository()
    await repo.create({
      productCode: 'SP001',
      productName: 'Cám heo con',
      animalCategory: 'heo',
      packageWeightGrams: 25000,
      inventoryUnit: 'Bao',
      currentSalePrice: 350000,
    })

    await expect(
      repo.create({
        productCode: 'SP001',
        productName: 'Cám heo lớn',
        animalCategory: 'heo',
        packageWeightGrams: 25000,
        inventoryUnit: 'Bao',
        currentSalePrice: 380000,
      })
    ).rejects.toThrow()
  })

  it('cập nhật sản phẩm thành công', async () => {
    const repo = getProductRepository()
    const product = await repo.create({
      productCode: 'SP001',
      productName: 'Cám heo con',
      animalCategory: 'heo',
      packageWeightGrams: 25000,
      inventoryUnit: 'Bao',
      currentSalePrice: 350000,
    })

    const updated = await repo.update({
      id: product.id,
      productName: 'Cám heo lớn',
      currentSalePrice: 380000,
    })

    expect(updated.productName).toBe('Cám heo lớn')
    expect(updated.currentSalePrice).toBe(380000)
    expect(updated.productCode).toBe('SP001') // unchanged
  })

  it('không cho cập nhật sang productCode đã tồn tại', async () => {
    const repo = getProductRepository()
    await repo.create({
      productCode: 'SP001',
      productName: 'Cám heo con',
      animalCategory: 'heo',
      packageWeightGrams: 25000,
      inventoryUnit: 'Bao',
      currentSalePrice: 350000,
    })

    const product2 = await repo.create({
      productCode: 'SP002',
      productName: 'Cám gà con',
      animalCategory: 'ga',
      packageWeightGrams: 25000,
      inventoryUnit: 'Bao',
      currentSalePrice: 300000,
    })

    await expect(
      repo.update({
        id: product2.id,
        productCode: 'SP001', // conflict
      })
    ).rejects.toThrow()
  })

  it('toggle active hoạt động đúng', async () => {
    const repo = getProductRepository()
    const product = await repo.create({
      productCode: 'SP001',
      productName: 'Cám heo con',
      animalCategory: 'heo',
      packageWeightGrams: 25000,
      inventoryUnit: 'Bao',
      currentSalePrice: 350000,
    })

    expect(product.active).toBe(true)

    // Toggle to false
    const inactive = await repo.toggleActive(product.id)
    expect(inactive.active).toBe(false)

    // Toggle back to true
    const activeAgain = await repo.toggleActive(product.id)
    expect(activeAgain.active).toBe(true)
  })

  it('cho phép xóa sản phẩm chưa có giao dịch', async () => {
    const repo = getProductRepository()
    const product = await repo.create({
      productCode: 'SP001',
      productName: 'Cám heo con',
      animalCategory: 'heo',
      packageWeightGrams: 25000,
      inventoryUnit: 'Bao',
      currentSalePrice: 350000,
    })

    await expect(repo.safeDelete(product.id)).resolves.not.toThrow()

    // Verify it is deleted
    await expect(repo.getById(product.id)).rejects.toThrow()
  })

  it('không cho xóa sản phẩm đã có inventory transaction', async () => {
    const repo = getProductRepository()
    const product = await repo.create({
      productCode: 'SP001',
      productName: 'Cám heo con',
      animalCategory: 'heo',
      packageWeightGrams: 25000,
      inventoryUnit: 'Bao',
      currentSalePrice: 350000,
    })

    // Insert dummy inventory transaction
    const db = getDb()
    await db.insert(inventoryTransactions).values({
      transactionDate: '2026-07-27',
      productId: product.id,
      transactionType: 'nhap',
      sourceType: 'nhap_hang',
      sourceId: 1,
      quantityIn: 10,
      quantityOut: 0,
      unitCost: 300000,
      stockAfter: 10,
    })

    await expect(repo.safeDelete(product.id)).rejects.toThrow('Sản phẩm này đã có giao dịch nhập/xuất')
  })

  it('không cho xóa sản phẩm đã có purchase invoice item', async () => {
    const repo = getProductRepository()
    const product = await repo.create({
      productCode: 'SP001',
      productName: 'Cám heo con',
      animalCategory: 'heo',
      packageWeightGrams: 25000,
      inventoryUnit: 'Bao',
      currentSalePrice: 350000,
    })

    const db = getDb()
    // Setup references: supplier, purchaseInvoice
    const [supplier] = await db.insert(suppliers).values({ companyName: 'Nha cung cap A' }).returning()
    const [invoice] = await db.insert(purchaseInvoices).values({
      receiptCode: 'PN001',
      invoiceNumber: 'INV001',
      invoiceDate: '2026-07-27',
      receivedDate: '2026-07-27',
      supplierId: supplier.id,
    }).returning()

    await db.insert(purchaseInvoiceItems).values({
      purchaseInvoiceId: invoice.id,
      productId: product.id,
      quantity: 10,
      invoiceUnitPrice: 300000,
      effectiveUnitCost: 300000,
      lineTotal: 3000000,
    })

    await expect(repo.safeDelete(product.id)).rejects.toThrow('Sản phẩm này đã có trong phiếu nhập hàng')
  })

  it('không cho xóa sản phẩm đã có sales invoice item', async () => {
    const repo = getProductRepository()
    const product = await repo.create({
      productCode: 'SP001',
      productName: 'Cám heo con',
      animalCategory: 'heo',
      packageWeightGrams: 25000,
      inventoryUnit: 'Bao',
      currentSalePrice: 350000,
    })

    const db = getDb()
    const [invoice] = await db.insert(salesInvoices).values({
      issueCode: 'PX001',
      invoiceDate: '2026-07-27',
    }).returning()

    await db.insert(salesInvoiceItems).values({
      salesInvoiceId: invoice.id,
      productId: product.id,
      quantity: 10,
      unitSalePrice: 350000,
      unitCostAtSale: 300000,
      lineRevenue: 3500000,
      lineCost: 3000000,
      estimatedProfit: 500000,
    })

    await expect(repo.safeDelete(product.id)).rejects.toThrow('Sản phẩm này đã có trong phiếu xuất hàng')
  })

  it('tìm kiếm theo mã và theo tên, lọc theo animalCategory và inventoryUnit, phân trang đúng', async () => {
    const repo = getProductRepository()
    await repo.create({
      productCode: 'SP001',
      productName: 'Cám heo con',
      animalCategory: 'heo',
      packageWeightGrams: 25000,
      inventoryUnit: 'Bao',
      currentSalePrice: 350000,
    })

    await repo.create({
      productCode: 'SP002',
      productName: 'Cám gà lớn',
      animalCategory: 'ga',
      packageWeightGrams: 25000,
      inventoryUnit: 'Bao',
      currentSalePrice: 300000,
    })

    await repo.create({
      productCode: 'SP003',
      productName: 'Thuốc bổ cho vịt',
      animalCategory: 'vit',
      packageWeightGrams: 500,
      inventoryUnit: 'Bich',
      currentSalePrice: 50000,
    })

    // Search by code
    const searchCode = await repo.list({ search: 'SP001' })
    expect(searchCode.total).toBe(1)
    expect(searchCode.items[0].productCode).toBe('SP001')

    // Search by name
    const searchName = await repo.list({ search: 'Cám gà' })
    expect(searchName.total).toBe(1)
    expect(searchName.items[0].productCode).toBe('SP002')

    // Filter by animalCategory
    const filterCat = await repo.list({ animalCategory: 'vit' })
    expect(filterCat.total).toBe(1)
    expect(filterCat.items[0].productCode).toBe('SP003')

    // Filter by inventoryUnit
    const filterUnit = await repo.list({ inventoryUnit: 'Bich' })
    expect(filterUnit.total).toBe(1)
    expect(filterUnit.items[0].inventoryUnit).toBe('Bich')

    // Pagination checks
    const paged = await repo.list({ page: 1, pageSize: 2 })
    expect(paged.items.length).toBe(2)
    expect(paged.total).toBe(3)
  })
})
