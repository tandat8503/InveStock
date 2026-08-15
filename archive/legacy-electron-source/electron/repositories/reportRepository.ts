import { getSqlite } from '../db/connection'
import type {
  ImportExportReportRow, InvoiceSearchRow, PaginatedResult, PriceHistoryReportRow,
  ProductSalesReportRow, ReportParams, RevenueReportRow, RevenueSummary,
  SupplierDebtReportRow,
} from '../../shared/ipc-types'

function margin(profit: number, revenue: number): number | null {
  return revenue === 0 ? null : Math.round((profit / revenue) * 10000) / 100
}

export class ReportRepository {
  inventory(params: ReportParams): ImportExportReportRow[] {
    const rows = getSqlite().prepare(`
      SELECT p.id productId, p.product_code productCode, p.product_name productName,
       p.animal_category animalCategory, p.inventory_unit inventoryUnit,
       COALESCE(SUM(CASE WHEN it.transaction_date < ? THEN it.quantity_in-it.quantity_out ELSE 0 END),0) openingStock,
       COALESCE((SELECT new_average_cost FROM inventory_transactions x WHERE x.product_id=p.id
         AND x.transaction_date < ? ORDER BY x.created_at DESC,x.id DESC LIMIT 1),0) openingUnitCost,
       COALESCE(SUM(CASE WHEN it.transaction_date BETWEEN ? AND ? AND it.transaction_type='nhap' THEN it.quantity_in ELSE 0 END),0) totalPurchaseQty,
       COALESCE(SUM(CASE WHEN it.transaction_date BETWEEN ? AND ? AND it.transaction_type='huy_nhap' THEN it.quantity_out ELSE 0 END),0) purchaseCancelQty,
       COALESCE(SUM(CASE WHEN it.transaction_date BETWEEN ? AND ? AND it.transaction_type='nhap' THEN it.quantity_in*it.unit_cost ELSE 0 END),0) purchaseValue,
       COALESCE(SUM(CASE WHEN it.transaction_date BETWEEN ? AND ? AND it.transaction_type='xuat' THEN it.quantity_out ELSE 0 END),0) totalSaleQty,
       COALESCE(SUM(CASE WHEN it.transaction_date BETWEEN ? AND ? AND it.transaction_type='huy_xuat' THEN it.quantity_in ELSE 0 END),0) saleCancelQty,
       COALESCE(SUM(CASE WHEN it.transaction_date BETWEEN ? AND ? AND it.transaction_type='xuat' THEN it.quantity_out*it.unit_cost ELSE 0 END),0) saleCostValue,
       COALESCE(SUM(CASE WHEN it.transaction_date <= ? THEN it.quantity_in-it.quantity_out ELSE 0 END),0) closingStock,
       COALESCE((SELECT new_average_cost FROM inventory_transactions x WHERE x.product_id=p.id
         AND x.transaction_date <= ? ORDER BY x.created_at DESC,x.id DESC LIMIT 1),0) closingAverageCost
      FROM products p LEFT JOIN inventory_transactions it ON it.product_id=p.id
      WHERE (? IS NULL OR p.id=?) AND (? IS NULL OR p.animal_category=?)
      GROUP BY p.id ORDER BY p.product_code
    `).all(
      params.dateFrom, params.dateFrom,
      params.dateFrom, params.dateTo, params.dateFrom, params.dateTo,
      params.dateFrom, params.dateTo, params.dateFrom, params.dateTo,
      params.dateFrom, params.dateTo, params.dateFrom, params.dateTo,
      params.dateTo, params.dateTo,
      params.productId ?? null, params.productId ?? null,
      params.animalCategory ?? null, params.animalCategory ?? null
    ) as Omit<ImportExportReportRow, 'openingValue' | 'closingValue'>[]
    return rows.map((row) => ({
      ...row,
      openingValue: row.openingStock * row.openingUnitCost,
      closingValue: row.closingStock * row.closingAverageCost,
    }))
  }

  revenue(params: ReportParams): RevenueSummary {
    const rows = getSqlite().prepare(`
      SELECT si.invoice_date invoiceDate, si.issue_code issueCode,
       si.electronic_invoice_number electronicInvoiceNumber, si.buyer_type buyerType,
       si.buyer_name buyerName, si.grand_total revenue, si.total_cost cost,
       si.estimated_profit profit
      FROM sales_invoices si WHERE si.status='xac_nhan'
       AND si.invoice_date BETWEEN ? AND ? AND (? IS NULL OR si.buyer_type=?)
       AND (? IS NULL OR EXISTS(SELECT 1 FROM sales_invoice_items x WHERE x.sales_invoice_id=si.id AND x.product_id=?))
      ORDER BY si.invoice_date,si.id
    `).all(params.dateFrom, params.dateTo, params.buyerType ?? null, params.buyerType ?? null,
      params.productId ?? null, params.productId ?? null) as Omit<RevenueReportRow, 'profitMargin'>[]
    const detailed = rows.map((row) => ({ ...row, profitMargin: margin(row.profit, row.revenue) }))
    const dayCount = Math.floor((Date.parse(params.dateTo) - Date.parse(params.dateFrom)) / 86400000) + 1
    const grouping = dayCount <= 31 ? 'day' as const : 'month' as const
    const grouped = new Map<string, { period: string; revenue: number; cost: number; profit: number }>()
    for (const row of detailed) {
      const period = grouping === 'day' ? row.invoiceDate : row.invoiceDate.slice(0, 7)
      const current = grouped.get(period) ?? { period, revenue: 0, cost: 0, profit: 0 }
      current.revenue += row.revenue; current.cost += row.cost; current.profit += row.profit
      grouped.set(period, current)
    }
    const totalRevenue = detailed.reduce((sum, row) => sum + row.revenue, 0)
    const totalCost = detailed.reduce((sum, row) => sum + row.cost, 0)
    const totalProfit = totalRevenue - totalCost
    const quantity = getSqlite().prepare(`SELECT COALESCE(SUM(sii.quantity),0) total FROM sales_invoice_items sii
      JOIN sales_invoices si ON si.id=sii.sales_invoice_id WHERE si.status='xac_nhan' AND si.invoice_date BETWEEN ? AND ?`
    ).get(params.dateFrom, params.dateTo) as { total: number }
    return { totalRevenue, totalCost, totalProfit, averageMargin: margin(totalProfit, totalRevenue),
      invoiceCount: detailed.length, totalItemsSold: quantity.total, grouping, chart: [...grouped.values()], rows: detailed }
  }

  productSales(params: ReportParams): ProductSalesReportRow[] {
    const rows = getSqlite().prepare(`
      SELECT p.id productId,p.product_code productCode,p.product_name productName,
       p.animal_category animalCategory,p.inventory_unit inventoryUnit,
       SUM(sii.quantity) quantitySold,SUM(sii.line_revenue) revenue,SUM(sii.line_cost) cost,
       SUM(sii.estimated_profit) profit,COUNT(DISTINCT si.id) invoiceCount
      FROM sales_invoice_items sii JOIN sales_invoices si ON si.id=sii.sales_invoice_id
       JOIN products p ON p.id=sii.product_id
      WHERE si.status='xac_nhan' AND si.invoice_date BETWEEN ? AND ?
       AND (? IS NULL OR p.id=?) AND (? IS NULL OR p.animal_category=?)
       AND (? IS NULL OR p.product_code LIKE ? OR p.product_name LIKE ?)
      GROUP BY p.id ORDER BY ${params.sortBy === 'profit' ? 'profit' : params.sortBy === 'quantitySold' ? 'quantitySold' : 'revenue'} ${params.sortDirection === 'asc' ? 'ASC' : 'DESC'}
    `).all(params.dateFrom, params.dateTo, params.productId ?? null, params.productId ?? null,
      params.animalCategory ?? null, params.animalCategory ?? null,
      params.search ? `%${params.search}%` : null, `%${params.search ?? ''}%`, `%${params.search ?? ''}%`
    ) as Omit<ProductSalesReportRow, 'averageSalePrice' | 'profitMargin'>[]
    return rows.map((row) => ({ ...row,
      averageSalePrice: row.quantitySold ? Math.round(row.revenue / row.quantitySold) : 0,
      profitMargin: margin(row.profit, row.revenue),
    }))
  }

  supplierDebt(params: ReportParams): SupplierDebtReportRow[] {
    const rows = getSqlite().prepare(`
      WITH inv AS (
       SELECT supplier_id,COUNT(*) invoiceCount,SUM(grand_total) purchased,SUM(paid_amount) snapshotPaid,
        MIN(CASE WHEN remaining_amount>0 THEN invoice_date END) oldest
       FROM purchase_invoices WHERE status='xac_nhan' AND invoice_date BETWEEN ? AND ? GROUP BY supplier_id
      ), pay AS (
       SELECT pi.supplier_id,SUM(sp.amount) paid,MAX(sp.payment_date) lastPayment
       FROM supplier_payments sp JOIN purchase_invoices pi ON pi.id=sp.purchase_invoice_id
       WHERE pi.status='xac_nhan' AND pi.invoice_date BETWEEN ? AND ? AND sp.payment_date<=? GROUP BY pi.supplier_id
      )
      SELECT s.id supplierId,s.company_name companyName,s.tax_code taxCode,s.phone,
       COALESCE(inv.invoiceCount,0) confirmedInvoiceCount,COALESCE(inv.purchased,0) totalPurchased,
       COALESCE(pay.paid,0) totalPaid,COALESCE(inv.purchased,0)-COALESCE(pay.paid,0) totalDebt,
       inv.oldest oldestUnpaidInvoiceDate,pay.lastPayment lastPaymentDate,
       CASE WHEN COALESCE(inv.snapshotPaid,0)=COALESCE(pay.paid,0) THEN 1 ELSE 0 END snapshotConsistent
      FROM suppliers s LEFT JOIN inv ON inv.supplier_id=s.id LEFT JOIN pay ON pay.supplier_id=s.id
      WHERE (? IS NULL OR s.id=?) ORDER BY totalDebt DESC
    `).all(params.dateFrom, params.dateTo, params.dateFrom, params.dateTo, params.dateTo,
      params.supplierId ?? null, params.supplierId ?? null) as (Omit<SupplierDebtReportRow, 'snapshotConsistent'> & { snapshotConsistent: number })[]
    return rows.map((row) => ({ ...row, snapshotConsistent: Boolean(row.snapshotConsistent) }))
  }

  priceHistory(params: ReportParams): PriceHistoryReportRow[] {
    const rows = getSqlite().prepare(`
      SELECT p.id productId,p.product_code productCode,p.product_name productName,
       h.old_price oldPrice,h.new_price newPrice,h.changed_at changedAt,h.reason
      FROM product_price_history h JOIN products p ON p.id=h.product_id
      WHERE h.price_type='sale_price' AND substr(h.changed_at,1,10) BETWEEN ? AND ?
       AND (? IS NULL OR p.id=?) AND (? IS NULL OR p.product_code LIKE ? OR p.product_name LIKE ?)
      ORDER BY h.changed_at DESC,h.id DESC
    `).all(params.dateFrom, params.dateTo, params.productId ?? null, params.productId ?? null,
      params.search ? `%${params.search}%` : null, `%${params.search ?? ''}%`, `%${params.search ?? ''}%`
    ) as Omit<PriceHistoryReportRow, 'difference' | 'changePercent'>[]
    return rows.map((row) => ({ ...row, difference: row.newPrice-row.oldPrice,
      changePercent: row.oldPrice === 0 ? null : Math.round(((row.newPrice-row.oldPrice)/row.oldPrice)*10000)/100 }))
  }

  invoiceSearch(params: ReportParams): PaginatedResult<InvoiceSearchRow> {
    const type = params.invoiceType ?? 'all'
    const search = `%${params.search ?? ''}%`
    const rows = getSqlite().prepare(`
      SELECT * FROM (
       SELECT pi.id,'purchase' invoiceType,pi.receipt_code documentCode,pi.invoice_number invoiceNumber,
        pi.invoice_date invoiceDate,s.company_name partnerName,COUNT(pii.id) itemCount,
        pi.grand_total grandTotal,pi.payment_status paymentStatus,pi.status
       FROM purchase_invoices pi JOIN suppliers s ON s.id=pi.supplier_id
        LEFT JOIN purchase_invoice_items pii ON pii.purchase_invoice_id=pi.id
       WHERE pi.invoice_date BETWEEN ? AND ? AND (? IS NULL OR pi.status=?)
        AND (? IS NULL OR pi.supplier_id=?)
        AND (pi.invoice_number LIKE ? OR pi.receipt_code LIKE ? OR s.company_name LIKE ?
         OR EXISTS(SELECT 1 FROM purchase_invoice_items x JOIN products p ON p.id=x.product_id WHERE x.purchase_invoice_id=pi.id AND (p.product_code LIKE ? OR p.product_name LIKE ?)))
       GROUP BY pi.id
       UNION ALL
       SELECT si.id,'sale',si.issue_code,si.electronic_invoice_number,si.invoice_date,
        COALESCE(si.buyer_name,'Khách lẻ'),COUNT(sii.id),si.grand_total,NULL,si.status
       FROM sales_invoices si LEFT JOIN sales_invoice_items sii ON sii.sales_invoice_id=si.id
       WHERE si.invoice_date BETWEEN ? AND ? AND (? IS NULL OR si.status=?)
        AND (? IS NULL OR si.buyer_type=?)
        AND (COALESCE(si.electronic_invoice_number,'') LIKE ? OR si.issue_code LIKE ? OR COALESCE(si.buyer_name,'') LIKE ?
         OR EXISTS(SELECT 1 FROM sales_invoice_items x JOIN products p ON p.id=x.product_id WHERE x.sales_invoice_id=si.id AND (p.product_code LIKE ? OR p.product_name LIKE ?)))
       GROUP BY si.id
      ) WHERE (?='all' OR invoiceType=?) ORDER BY invoiceDate DESC,id DESC
    `).all(params.dateFrom,params.dateTo,params.status??null,params.status??null,
      params.supplierId??null,params.supplierId??null,search,search,search,search,search,
      params.dateFrom,params.dateTo,params.status??null,params.status??null,
      params.buyerType??null,params.buyerType??null,search,search,search,search,search,type,type
    ) as InvoiceSearchRow[]
    const page=params.page??1,pageSize=params.pageSize??20
    return { items: rows.slice((page-1)*pageSize,page*pageSize), total: rows.length, page, pageSize }
  }
}

let instance: ReportRepository | null = null
export function getReportRepository(): ReportRepository {
  if (!instance) instance = new ReportRepository()
  return instance
}
