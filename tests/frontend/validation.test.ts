import { describe, it, expect } from 'vitest'
import { createProductSchema, createPurchaseInvoiceSchema, createSalesInvoiceSchema, createSupplierSchema } from '../../shared/schemas'

describe('Zod Validation Schemas', () => {
  describe('Product Schema', () => {
    it('should validate a correct product', () => {
      const validProduct = {
        productCode: 'SP01',
        productName: 'Cám heo',
        animalCategory: 'heo',
        packageWeightGrams: 25000,
        packageWeightUnit: 'kg',
        inventoryUnit: 'Bao',
        currentSalePrice: 300000,
      }
      const result = createProductSchema.safeParse(validProduct)
      expect(result.success).toBe(true)
    })

    it('should reject empty productCode', () => {
      const result = createProductSchema.safeParse({
        productCode: '',
        productName: 'Cám heo',
        animalCategory: 'heo',
        packageWeightGrams: 25000,
        inventoryUnit: 'Bao',
        currentSalePrice: 300000,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Mã sản phẩm không được để trống')
      }
    })

    it('should reject empty productName', () => {
      const result = createProductSchema.safeParse({
        productCode: 'SP01',
        productName: '   ', // whitespace only
        animalCategory: 'heo',
        packageWeightGrams: 25000,
        inventoryUnit: 'Bao',
        currentSalePrice: 300000,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Tên sản phẩm không được để trống')
      }
    })

    it('should reject invalid animalCategory', () => {
      const result = createProductSchema.safeParse({
        productCode: 'SP01',
        productName: 'Cám heo',
        animalCategory: 'unknown_animal',
        packageWeightGrams: 25000,
        inventoryUnit: 'Bao',
        currentSalePrice: 300000,
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid inventoryUnit', () => {
      const result = createProductSchema.safeParse({
        productCode: 'SP01',
        productName: 'Cám heo',
        animalCategory: 'heo',
        packageWeightGrams: 25000,
        inventoryUnit: 'Chai', // invalid unit (only Bao, Tui, Bich allowed)
        currentSalePrice: 300000,
      })
      expect(result.success).toBe(false)
    })

    it('should reject negative packageWeightGrams', () => {
      const result = createProductSchema.safeParse({
        productCode: 'SP01',
        productName: 'Cám heo',
        animalCategory: 'heo',
        packageWeightGrams: -10,
        inventoryUnit: 'Bao',
        currentSalePrice: 300000,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Trọng lượng không được âm')
      }
    })

    it('should reject non-integer packageWeightGrams', () => {
      const result = createProductSchema.safeParse({
        productCode: 'SP01',
        productName: 'Cám heo',
        animalCategory: 'heo',
        packageWeightGrams: 25000.5,
        inventoryUnit: 'Bao',
        currentSalePrice: 300000,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Trọng lượng phải là số nguyên')
      }
    })

    it('does not accept legacy product sale price into the active product payload', () => {
      const result = createProductSchema.safeParse({
        productCode: 'SP01',
        productName: 'Cám heo',
        animalCategory: 'heo',
        packageWeightGrams: 25000,
        inventoryUnit: 'Bao',
        currentSalePrice: 300000,
      })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data).not.toHaveProperty('currentSalePrice')
    })
  })

  describe('Supplier Schema', () => {
    it('should validate a correct supplier', () => {
      const validSupplier = {
        companyName: 'Công ty Cám',
        phone: '0123456789',
      }
      const result = createSupplierSchema.safeParse(validSupplier)
      expect(result.success).toBe(true)
    })

    it('should reject company name with only whitespace', () => {
      const invalidSupplier = {
        companyName: '   ',
        phone: '0123456789',
      }
      const result = createSupplierSchema.safeParse(invalidSupplier)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Tên nhà cung cấp không được để trống')
      }
    })

    it('should allow optional supplier fields to be omitted or valid', () => {
      const minimalSupplier = {
        companyName: 'Công ty Cám',
      }
      const result = createSupplierSchema.safeParse(minimalSupplier)
      expect(result.success).toBe(true)
    })
  })

  describe('Invoice safety rules', () => {
    const purchase = {
      invoiceNumber: 'HD-1',
      invoiceDate: '2026-08-01',
      receivedDate: '2026-08-01',
      supplierId: 1,
      items: [{ productId: 1, quantity: 2, lineTotal: 100 }],
    }

    it('rejects zero purchase and sale prices', () => {
      expect(createPurchaseInvoiceSchema.safeParse({ ...purchase, items: [{ ...purchase.items[0], lineTotal: 0 }] }).success).toBe(false)
      expect(createSalesInvoiceSchema.safeParse({ invoiceDate: '2026-08-01', buyerType: 'khach_le', items: [{ productId: 1, quantity: 1, lineTotalSale: 0 }] }).success).toBe(false)
    })

    it('rejects duplicate products', () => {
      expect(createPurchaseInvoiceSchema.safeParse({ ...purchase, items: [purchase.items[0], purchase.items[0]] }).success).toBe(false)
    })
  })
})
