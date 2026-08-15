import { getSqlite } from '../db/connection'
import type { SalesInvoiceDTO } from '../../shared/ipc-types'
import { getSaleRepository } from '../repositories/saleRepository'

interface ConfirmItem {
  id: number
  product_id: number
  quantity: number
  unit_sale_price: number
  product_code: string
  product_name: string
  inventory_unit: string
  current_stock: number
  average_cost: number
  active: number
}

class SaleService {
  async confirm(id: number): Promise<SalesInvoiceDTO> {
    const sqlite = getSqlite()
    sqlite.transaction(() => {
      const invoice = sqlite.prepare('SELECT status FROM sales_invoices WHERE id = ?').get(id) as {
        status: string
      } | undefined
      if (!invoice) throw new Error(`Phiếu xuất #${id} không tồn tại`)
      if (invoice.status !== 'nhap') throw new Error('Chỉ có thể xác nhận phiếu xuất nháp')

      const items = sqlite.prepare(
        `SELECT sii.id, sii.product_id, sii.quantity, sii.unit_sale_price,
                p.product_code, p.product_name, p.inventory_unit,
                p.current_stock, p.average_cost, p.active
         FROM sales_invoice_items sii
         JOIN products p ON p.id = sii.product_id
         WHERE sii.sales_invoice_id = ?`
      ).all(id) as ConfirmItem[]
      if (items.length === 0) throw new Error('Phiếu xuất phải có ít nhất một sản phẩm')

      for (const item of items) {
        if (!item.active) throw new Error(`${item.product_code} - ${item.product_name} đã ngừng kinh doanh`)
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('Số lượng xuất phải là số nguyên lớn hơn 0')
        if (item.quantity > item.current_stock) {
          throw new Error(
            `${item.product_code} - ${item.product_name}: cần xuất ${item.quantity} ${item.inventory_unit}, ` +
            `tồn hiện tại ${item.current_stock} ${item.inventory_unit}, thiếu ${item.quantity - item.current_stock} ${item.inventory_unit}`
          )
        }
      }

      let subtotal = 0
      let totalCost = 0
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
      for (const item of items) {
        const lineRevenue = item.quantity * item.unit_sale_price
        const lineCost = item.quantity * item.average_cost
        subtotal += lineRevenue
        totalCost += lineCost
        sqlite.prepare(
          `UPDATE sales_invoice_items SET unit_cost_at_sale = ?, line_revenue = ?,
           line_cost = ?, estimated_profit = ? WHERE id = ?`
        ).run(item.average_cost, lineRevenue, lineCost, lineRevenue - lineCost, item.id)
        const stockAfter = item.current_stock - item.quantity
        sqlite.prepare(
          'UPDATE products SET current_stock = ?, updated_at = ? WHERE id = ?'
        ).run(stockAfter, now, item.product_id)
        sqlite.prepare(
          `INSERT INTO inventory_transactions
           (transaction_date, product_id, transaction_type, source_type, source_id,
            quantity_in, quantity_out, unit_cost, stock_before, stock_after,
            old_average_cost, new_average_cost, created_at)
           VALUES (?, ?, 'xuat', 'sales_invoice', ?, 0, ?, ?, ?, ?, ?, ?, ?)`
        ).run(now.slice(0, 10), item.product_id, id, item.quantity, item.average_cost,
          item.current_stock, stockAfter, item.average_cost, item.average_cost, now)
      }
      sqlite.prepare(
        `UPDATE sales_invoices SET subtotal = ?, grand_total = ?, total_cost = ?,
         estimated_profit = ?, status = 'xac_nhan', confirmed_at = ? WHERE id = ?`
      ).run(subtotal, subtotal, totalCost, subtotal - totalCost, now, id)
    })()
    return await getSaleRepository().getById(id)
  }

  async cancel(id: number, reason?: string): Promise<SalesInvoiceDTO> {
    const normalizedReason = reason?.trim() ?? ''
    if (normalizedReason.length < 5 || normalizedReason.length > 500) {
      throw new Error('Lý do hủy phải từ 5 đến 500 ký tự')
    }
    const sqlite = getSqlite()
    sqlite.transaction(() => {
      const invoice = sqlite.prepare('SELECT status FROM sales_invoices WHERE id = ?').get(id) as {
        status: string
      } | undefined
      if (!invoice) throw new Error(`Phiếu xuất #${id} không tồn tại`)
      if (invoice.status === 'nhap') throw new Error('Phiếu nháp không cần hủy — có thể xóa trực tiếp')
      if (invoice.status === 'huy') throw new Error('Phiếu xuất đã được hủy trước đó')

      const items = sqlite.prepare(
        `SELECT sii.product_id, sii.quantity, sii.unit_cost_at_sale,
                p.current_stock, p.average_cost
         FROM sales_invoice_items sii JOIN products p ON p.id = sii.product_id
         WHERE sii.sales_invoice_id = ?`
      ).all(id) as {
        product_id: number; quantity: number; unit_cost_at_sale: number;
        current_stock: number; average_cost: number;
      }[]
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
      for (const item of items) {
        const stockAfter = item.current_stock + item.quantity
        sqlite.prepare('UPDATE products SET current_stock = ?, updated_at = ? WHERE id = ?')
          .run(stockAfter, now, item.product_id)
        sqlite.prepare(
          `INSERT INTO inventory_transactions
           (transaction_date, product_id, transaction_type, source_type, source_id,
            quantity_in, quantity_out, unit_cost, stock_before, stock_after,
            old_average_cost, new_average_cost, created_at)
           VALUES (?, ?, 'huy_xuat', 'sales_invoice', ?, ?, 0, ?, ?, ?, ?, ?, ?)`
        ).run(now.slice(0, 10), item.product_id, id, item.quantity, item.unit_cost_at_sale,
          item.current_stock, stockAfter, item.average_cost, item.average_cost, now)
      }
      sqlite.prepare(
        `UPDATE sales_invoices SET status = 'huy', cancelled_at = ?,
         cancellation_reason = ? WHERE id = ?`
      ).run(now, normalizedReason, id)
    })()
    return await getSaleRepository().getById(id)
  }
}

let instance: SaleService | null = null

export function getSaleService(): SaleService {
  if (!instance) instance = new SaleService()
  return instance
}
