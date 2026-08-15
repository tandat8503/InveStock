import { getSqlite } from '../db/connection'
import { calculateAverageCost } from './inventoryService'
import type { PurchaseInvoiceDTO } from '../../shared/ipc-types'
import { getPurchaseRepository } from '../repositories/purchaseRepository'

class PurchaseService {
  /**
   * Xác nhận phiếu nhập.
   * Tất cả các bước chạy trong một SQLite transaction:
   * 1. Cập nhật trạng thái phiếu → xac_nhan
   * 2. Tăng tồn kho từng sản phẩm
   * 3. Cập nhật giá nhập gần nhất
   * 4. Tính lại giá vốn bình quân
   * 5. Ghi lịch sử kho (inventory_transactions)
   * 6. Cập nhật product_price_history nếu giá thay đổi
   */
  async confirm(id: number): Promise<PurchaseInvoiceDTO> {
    const sqlite = getSqlite()

    const confirmFn = sqlite.transaction(() => {
      const currentInvoice = sqlite
        .prepare('SELECT * FROM purchase_invoices WHERE id = ?')
        .get(id) as Record<string, unknown> | undefined
      if (!currentInvoice) throw new Error(`Phiếu nhập #${id} không tồn tại`)
      if (currentInvoice['status'] !== 'nhap') {
        throw new Error('Phiếu nhập chỉ có thể xác nhận khi ở trạng thái nháp')
      }
      const items = sqlite.prepare(
        `SELECT pii.*, p.current_stock, p.average_cost, p.latest_purchase_price
         FROM purchase_invoice_items pii JOIN products p ON pii.product_id = p.id
         WHERE pii.purchase_invoice_id = ?`
      ).all(id) as Record<string, number>[]
      if (items.length === 0) throw new Error('Phiếu nhập phải có ít nhất một sản phẩm')
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

      // 1. Update invoice status
      sqlite
        .prepare(
          `UPDATE purchase_invoices SET status = 'xac_nhan', confirmed_at = ? WHERE id = ?`
        )
        .run(now, id)

      for (const item of items) {
        const oldStock = item['current_stock']
        const oldCost = item['average_cost']
        const newQty = item['quantity']
        const newUnitCost = item['effective_unit_cost']
        const productId = item['product_id']

        // 2 & 3. Tăng tồn kho, cập nhật giá nhập gần nhất
        const newStock = oldStock + newQty
        const newAverageCost = calculateAverageCost(oldStock, oldCost, newQty, newUnitCost)

        sqlite
          .prepare(
            `UPDATE products
             SET current_stock = ?,
                 average_cost = ?,
                 latest_purchase_price = ?,
                 updated_at = ?
             WHERE id = ?`
          )
          .run(newStock, newAverageCost, newUnitCost, now, productId)

        // 4. Ghi lịch sử kho
        sqlite
          .prepare(
            `INSERT INTO inventory_transactions
             (transaction_date, product_id, transaction_type, source_type, source_id, quantity_in, quantity_out, unit_cost, stock_before, stock_after, old_average_cost, new_average_cost, created_at)
             VALUES (?, ?, 'nhap', 'purchase_invoice', ?, ?, 0, ?, ?, ?, ?, ?, ?)`
          )
          .run(now.substring(0, 10), productId, id, newQty, newUnitCost, oldStock, newStock, oldCost, newAverageCost, now)

        // 5. Ghi lịch sử giá vốn nếu thay đổi
        if (newAverageCost !== oldCost) {
          sqlite
            .prepare(
              `INSERT INTO product_price_history (product_id, price_type, old_price, new_price, changed_at, reason)
               VALUES (?, 'average_cost', ?, ?, ?, ?)`
            )
            .run(productId, oldCost, newAverageCost, now, `Nhập kho: ${currentInvoice['receipt_code'] as string}`)
        }
      }
    })

    confirmFn()

    // Return updated invoice (sync call wrapped in async-compatible return)
    const repo = getPurchaseRepository()
    return await repo.getById(id)
  }

  /**
   * Hủy phiếu nhập đã xác nhận.
   * 1. Kiểm tra xem hàng từ phiếu này đã được xuất chưa
   * 2. Nếu đã xuất: chặn và yêu cầu xử lý thủ công
   * 3. Nếu chưa: hoàn tồn kho, ghi giao dịch đảo ngược
   */
  async cancel(id: number, reason?: string): Promise<PurchaseInvoiceDTO> {
    const sqlite = getSqlite()
    const cancelFn = sqlite.transaction(() => {
      const invoice = sqlite.prepare(
        'SELECT status FROM purchase_invoices WHERE id = ?'
      ).get(id) as { status: string } | undefined
      if (!invoice) throw new Error(`Phiếu nhập #${id} không tồn tại`)
      if (invoice.status === 'nhap') throw new Error('Phiếu nháp không cần hủy — có thể xóa trực tiếp')
      if (invoice.status === 'huy') throw new Error('Phiếu nhập đã được hủy trước đó')

      const payment = sqlite.prepare(
        'SELECT COUNT(*) AS count FROM supplier_payments WHERE purchase_invoice_id = ?'
      ).get(id) as { count: number }
      if (payment.count > 0) {
        throw new Error('Không thể hủy phiếu nhập đã phát sinh thanh toán. Vui lòng xử lý hoàn tiền hoặc điều chỉnh thanh toán trước.')
      }

      const items = sqlite.prepare(
        `SELECT pii.product_id, pii.quantity, pii.effective_unit_cost,
                p.product_code, p.product_name, p.inventory_unit,
                p.current_stock, p.average_cost,
                it.id AS confirm_transaction_id, it.old_average_cost, it.new_average_cost
         FROM purchase_invoice_items pii
         JOIN products p ON p.id = pii.product_id
         JOIN inventory_transactions it ON it.product_id = pii.product_id
           AND it.source_type = 'purchase_invoice' AND it.source_id = pii.purchase_invoice_id
           AND it.transaction_type = 'nhap'
         WHERE pii.purchase_invoice_id = ?`
      ).all(id) as {
        product_id: number; quantity: number; effective_unit_cost: number;
        product_code: string; product_name: string; inventory_unit: string;
        current_stock: number; average_cost: number; confirm_transaction_id: number;
        old_average_cost: number; new_average_cost: number;
      }[]
      if (items.length === 0) throw new Error('Phiếu nhập không có giao dịch xác nhận hợp lệ')

      for (const item of items) {
        if (item.current_stock < item.quantity) {
          throw new Error(
            `Không thể hủy ${item.product_code} - ${item.product_name}. ` +
            `Tồn hiện tại: ${item.current_stock} ${item.inventory_unit}; ` +
            `số lượng cần hoàn: ${item.quantity} ${item.inventory_unit}.`
          )
        }
        const later = sqlite.prepare(
          'SELECT 1 FROM inventory_transactions WHERE product_id = ? AND id > ? LIMIT 1'
        ).get(item.product_id, item.confirm_transaction_id)
        if (later) throw new Error(`Không thể hủy vì ${item.product_code} - ${item.product_name} đã có giao dịch kho phát sinh sau phiếu nhập`)
      }

      const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

      // 1. Update invoice status to cancelled
      sqlite
        .prepare(
          `UPDATE purchase_invoices SET status = 'huy', cancelled_at = ? WHERE id = ?`
        )
        .run(now, id)

      for (const item of items) {
        const newStock = item.current_stock - item.quantity
        const latest = sqlite.prepare(
          `SELECT pii.effective_unit_cost AS price
           FROM purchase_invoice_items pii
           JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id
           WHERE pii.product_id = ? AND pi.status = 'xac_nhan' AND pi.id <> ?
           ORDER BY pi.confirmed_at DESC, pi.id DESC LIMIT 1`
        ).get(item.product_id, id) as { price: number } | undefined
        sqlite
          .prepare(
            `UPDATE products SET current_stock = ?, average_cost = ?,
             latest_purchase_price = ?, updated_at = ? WHERE id = ?`
          )
          .run(newStock, item.old_average_cost, latest?.price ?? 0, now, item.product_id)

        // Write reversal transaction
        sqlite
          .prepare(
            `INSERT INTO inventory_transactions
             (transaction_date, product_id, transaction_type, source_type, source_id,
              quantity_in, quantity_out, unit_cost, stock_before, stock_after,
              old_average_cost, new_average_cost, created_at)
             VALUES (?, ?, 'huy_nhap', 'purchase_invoice', ?, 0, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(now.substring(0, 10), item.product_id, id, item.quantity,
            item.effective_unit_cost, item.current_stock, newStock,
            item.average_cost, item.old_average_cost, now)
      }
      sqlite.prepare(
        `UPDATE purchase_invoices SET paid_amount = 0, remaining_amount = 0,
         payment_status = 'chua_thanh_toan', notes = CASE WHEN ? IS NULL OR ? = '' THEN notes
         ELSE trim(COALESCE(notes, '') || char(10) || 'Lý do hủy: ' || ?) END WHERE id = ?`
      ).run(reason ?? null, reason ?? null, reason ?? null, id)
    })

    cancelFn()
    return await getPurchaseRepository().getById(id)
  }
}

let _instance: PurchaseService | null = null

export function getPurchaseService(): PurchaseService {
  if (!_instance) _instance = new PurchaseService()
  return _instance
}
