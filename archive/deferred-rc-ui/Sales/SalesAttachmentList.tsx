import { AttachmentList } from '../Purchases/AttachmentList'

export function SalesAttachmentList({ saleId, editable }: { saleId: number; editable: boolean }) {
  return <AttachmentList invoiceId={saleId} editable={editable} entityType="sales_invoice" />
}
