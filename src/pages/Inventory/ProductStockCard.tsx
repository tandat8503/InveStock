import { appCommands } from '@/lib/commands'
import { useEffect, useState } from 'react'
import { Modal, LoadingState } from '@/components/ui'
import type { InventoryTransactionDTO } from '@shared/ipc-types'
import { InventoryTransactionList } from './InventoryTransactionList'
import { PurchaseDetail } from '../Purchases/PurchaseDetail'
import { SalesDetail } from '../Sales/SalesDetail'

export function ProductStockCard({ productId, onClose }: { productId: number | null; onClose: () => void }) {
  const [transactions, setTransactions] = useState<InventoryTransactionDTO[] | null>(null)
  const [purchaseId, setPurchaseId] = useState<number | null>(null)
  const [saleId, setSaleId] = useState<number | null>(null)
  useEffect(() => {
    setTransactions(null)
    if (productId) void appCommands.inventory.productHistory(productId).then((r) => setTransactions(r.data ?? []))
  }, [productId])
  return <><Modal isOpen={productId !== null} onClose={onClose} title="Thẻ kho sản phẩm" size="xl">
    {!transactions ? <LoadingState /> : <InventoryTransactionList transactions={transactions} onSource={(tx) => {
      if (tx.sourceType === 'purchase_invoice') setPurchaseId(tx.sourceId)
      if (tx.sourceType === 'sales_invoice') setSaleId(tx.sourceId)
    }} />}
  </Modal><PurchaseDetail id={purchaseId} onClose={() => setPurchaseId(null)} /><SalesDetail id={saleId} onClose={() => setSaleId(null)} /></>
}
