import { appCommands } from '@/lib/commands'
import { useEffect, useState } from 'react'
import { Button, Input, Modal } from '@/components/ui'

export function CancelSaleModal({ saleId, onClose, onSuccess }: { saleId: number | null; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setReason(''); setError('') }, [saleId])
  const submit = async () => {
    if (!saleId || saving) return
    setSaving(true)
    const result = await appCommands.sales.cancel(saleId, reason)
    setSaving(false)
    if (result.success) onSuccess()
    else setError(result.error ?? 'Không thể hủy phiếu')
  }
  return <Modal isOpen={saleId !== null} onClose={onClose} title="Hủy phiếu xuất" footer={<>
    <Button variant="danger" isLoading={saving} onClick={() => void submit()}>Xác nhận hủy</Button>
    <Button variant="secondary" onClick={onClose}>Đóng</Button>
  </>}>
    <Input label="Lý do hủy (5–500 ký tự)" value={reason} onChange={(e) => setReason(e.target.value)} />
    {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
  </Modal>
}
