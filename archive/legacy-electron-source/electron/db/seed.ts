import { getDb } from './connection'

export async function seedDatabase(): Promise<void> {
  const db = getDb()

  // Seed sample products
  await db
    .insert(
      // Import dynamically to avoid circular deps
      (await import('./schema')).products
    )
    .values([
      {
        productCode: 'HH00001',
        productName: 'Cám heo tập ăn G02 5kg',
        animalCategory: 'heo',
        packageWeightGrams: 5000,
        packageWeightUnit: 'kg',
        inventoryUnit: 'Tui',
        brand: 'Greenfeed',
        latestPurchasePrice: 0,
        averageCost: 0,
        currentSalePrice: 280000,
        currentStock: 0,
        active: true,
        notes: null,
      },
      {
        productCode: 'HH00002',
        productName: 'Cám heo tập ăn G02 25kg',
        animalCategory: 'heo',
        packageWeightGrams: 25000,
        packageWeightUnit: 'kg',
        inventoryUnit: 'Bao',
        brand: 'Greenfeed',
        latestPurchasePrice: 0,
        averageCost: 0,
        currentSalePrice: 350000,
        currentStock: 0,
        active: true,
        notes: null,
      },
      {
        productCode: 'GA00001',
        productName: 'Cám gà đẻ GreenFarm 25kg',
        animalCategory: 'ga',
        packageWeightGrams: 25000,
        packageWeightUnit: 'kg',
        inventoryUnit: 'Bao',
        brand: 'GreenFarm',
        latestPurchasePrice: 0,
        averageCost: 0,
        currentSalePrice: 320000,
        currentStock: 0,
        active: true,
        notes: null,
      },
    ])
    .onConflictDoNothing()

  // Seed sample suppliers
  await db
    .insert((await import('./schema')).suppliers)
    .values([
      {
        companyName: 'Công ty TNHH Greenfeed Việt Nam',
        phone: '028-3812-3456',
        address: 'Khu công nghiệp Sóng Thần, Bình Dương',
        taxCode: '0301234567',
        contactPerson: 'Nguyễn Văn An',
        bankAccount: '123456789 - Vietcombank',
        notes: 'Nhà cung cấp chính',
        active: true,
      },
      {
        companyName: 'Công ty Cổ phần Chăn nuôi C.P. Việt Nam',
        phone: '028-3756-7890',
        address: 'Đường số 1, KCN Amata, Đồng Nai',
        taxCode: '0601234567',
        contactPerson: 'Trần Thị Bình',
        bankAccount: '987654321 - BIDV',
        notes: null,
        active: true,
      },
    ])
    .onConflictDoNothing()
}
