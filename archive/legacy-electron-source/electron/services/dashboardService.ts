import { getSqlite } from '../db/connection'
import type { DashboardStats } from '../../shared/ipc-types'

class DashboardService {
  getStats(): DashboardStats {
    const sqlite = getSqlite()

    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const monthStart = `${year}-${month}-01`
    const nextMonthDate = new Date(year, now.getMonth() + 1, 1)
    const nextMonthStart = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`

    // Total products (active)
    const totalProducts = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM products WHERE active = 1`
    ).get() as { cnt: number }).cnt

    // Total stock (sum of all active products)
    const stockResult = sqlite.prepare(
      `SELECT COALESCE(SUM(current_stock), 0) as total FROM products WHERE active = 1`
    ).get() as { total: number }
    const totalStock = stockResult.total

    // Total stock value
    const stockValueResult = sqlite.prepare(
      `SELECT COALESCE(SUM(current_stock * average_cost), 0) as total FROM products WHERE active = 1`
    ).get() as { total: number }
    const totalStockValue = stockValueResult.total

    // Monthly purchase total (confirmed invoices this month)
    const monthlyPurchaseResult = sqlite.prepare(
      `SELECT COALESCE(SUM(grand_total), 0) as total FROM purchase_invoices
       WHERE status = 'xac_nhan' AND invoice_date >= ? AND invoice_date < ?`
    ).get(monthStart, nextMonthStart) as { total: number }
    const monthlyPurchaseTotal = monthlyPurchaseResult.total

    // Monthly sales total (confirmed invoices this month)
    const monthlySalesResult = sqlite.prepare(
      `SELECT COALESCE(SUM(grand_total), 0) as total FROM sales_invoices
       WHERE status = 'xac_nhan' AND invoice_date >= ? AND invoice_date < ?`
    ).get(monthStart, nextMonthStart) as { total: number }
    const monthlySalesTotal = monthlySalesResult.total

    // Monthly profit
    const monthlyProfitResult = sqlite.prepare(
      `SELECT COALESCE(SUM(estimated_profit), 0) as total FROM sales_invoices
       WHERE status = 'xac_nhan' AND invoice_date >= ? AND invoice_date < ?`
    ).get(monthStart, nextMonthStart) as { total: number }
    const monthlyProfit = monthlyProfitResult.total

    // Total supplier debt (all confirmed unpaid)
    const debtResult = sqlite.prepare(
      `SELECT COALESCE(SUM(remaining_amount), 0) as total FROM purchase_invoices WHERE status = 'xac_nhan'`
    ).get() as { total: number }
    const totalSupplierDebt = debtResult.total

    // Out of stock products
    const outOfStockProducts = sqlite.prepare(
      `SELECT * FROM products WHERE active = 1 AND current_stock <= 0 LIMIT 20`
    ).all() as Record<string, unknown>[]

    // Recent transactions (last 10)
    const recentTransactions = sqlite.prepare(
      `SELECT it.*, p.product_code, p.product_name FROM inventory_transactions it
       JOIN products p ON it.product_id = p.id
       ORDER BY it.created_at DESC LIMIT 10`
    ).all() as Record<string, unknown>[]

    return {
      totalProducts,
      totalStock,
      totalStockValue,
      monthlyPurchaseTotal,
      monthlySalesTotal,
      monthlyProfit,
      totalSupplierDebt,
      outOfStockProducts: outOfStockProducts.map((p) => ({
        id: p['id'] as number,
        productCode: p['product_code'] as string,
        productName: p['product_name'] as string,
        animalCategory: p['animal_category'] as DashboardStats['outOfStockProducts'][0]['animalCategory'],
        packageWeightGrams: p['package_weight_grams'] as number,
        packageWeightUnit: p['package_weight_unit'] as string,
        inventoryUnit: p['inventory_unit'] as DashboardStats['outOfStockProducts'][0]['inventoryUnit'],
        brand: p['brand'] as string | null,
        latestPurchasePrice: p['latest_purchase_price'] as number,
        averageCost: p['average_cost'] as number,
        currentSalePrice: p['current_sale_price'] as number,
        currentStock: p['current_stock'] as number,
        active: Boolean(p['active']),
        notes: p['notes'] as string | null,
        createdAt: p['created_at'] as string,
        updatedAt: p['updated_at'] as string,
      })),
      recentTransactions: recentTransactions.map((t) => ({
        id: t['id'] as number,
        transactionDate: t['transaction_date'] as string,
        productId: t['product_id'] as number,
        productCode: t['product_code'] as string,
        productName: t['product_name'] as string,
        transactionType: t['transaction_type'] as string,
        sourceType: t['source_type'] as string,
        sourceId: t['source_id'] as number,
        quantityIn: t['quantity_in'] as number,
        quantityOut: t['quantity_out'] as number,
        unitCost: t['unit_cost'] as number,
        stockBefore: t['stock_before'] as number | null,
        stockAfter: t['stock_after'] as number,
        createdAt: t['created_at'] as string,
      })),
    }
  }
}

let _instance: DashboardService | null = null

export function getDashboardService(): DashboardService {
  if (!_instance) _instance = new DashboardService()
  return _instance
}
