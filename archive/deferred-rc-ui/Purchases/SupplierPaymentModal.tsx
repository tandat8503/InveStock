import { appCommands } from '@/lib/commands'
import { useEffect, useState } from 'react'
import { Button, CurrencyInput, Input, Modal, Select } from '@/components/ui'
import type { PurchaseInvoiceDTO, PaymentMethod } from '@shared/ipc-types'

export function SupplierPaymentModal({ invoice, onClose, onSuccess }: {
  invoice: PurchaseInvoiceDTO | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState(0)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState<PaymentMethod>('chuyen_khoan')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setAmount(0)
    setReference('')
    setError('')
  }, [invoice])
  const save = async () => {
    if (!invoice || saving || amount <= 0 || amount > invoice.remainingAmount) return
    setSaving(true)
    setError('')
    const result = await appCommands.payments.create({
      purchaseInvoiceId: invoice.id, paymentDate, amount, paymentMethod: method,
      transactionReference: reference || undefined,
    })
    setSaving(false)
    if (result.success) onSuccess()
    else setError(result.error ?? 'Không thể ghi nhận thanh toán')
  }
  return <Modal isOpen={invoice !== null} onClose={onClose} title="Ghi nhận thanh toán" footer={<>
    <Button onClick={() => void save()} isLoading={saving}>Lưu thanh toán</Button>
    <Button variant="secondary" onClick={onClose}>Đóng</Button>
  </>}>
    {invoice && <div className="space-y-4">
      <p className="text-sm">Còn lại: <strong>{invoice.remainingAmount.toLocaleString('vi-VN')} ₫</strong></p>
      <Input type="date" label="Ngày thanh toán" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
      <CurrencyInput label="Số tiền" value={amount} onChange={setAmount} />
      <Select label="Phương thức" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}
        options={[{ value: 'chuyen_khoan', label: 'Chuyển khoản' }, { value: 'tien_mat', label: 'Tiền mặt' }, { value: 'khac', label: 'Khác' }]} />
      <Input label="Mã giao dịch" value={reference} onChange={(event) => setReference(event.target.value)} />
      {amount > invoice.remainingAmount && <p className="text-sm text-red-600">Số tiền vượt quá số còn lại.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>}
  </Modal>
}
