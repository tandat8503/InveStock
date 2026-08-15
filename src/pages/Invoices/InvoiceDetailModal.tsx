import type { InvoiceSearchRow } from '@shared/ipc-types'
import { PurchaseDetail } from '../Purchases/PurchaseDetail'
import { SalesDetail } from '../Sales/SalesDetail'

export function InvoiceDetailModal({ row, onClose }: { row: InvoiceSearchRow | null; onClose: () => void }) {
  return <>{row?.invoiceType === 'purchase' && <PurchaseDetail id={row.id} onClose={onClose} />}{row?.invoiceType === 'sale' && <SalesDetail id={row.id} onClose={onClose} />}</>
}
