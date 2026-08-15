import { appCommands } from '@/lib/commands'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import type { AttachmentDTO } from '@shared/ipc-types'

export function AttachmentList({ invoiceId, editable, entityType = 'purchase_invoice', onChanged }: { invoiceId: number; editable: boolean; entityType?: 'purchase_invoice' | 'sales_invoice'; onChanged?: () => void }) {
  const [files, setFiles] = useState<AttachmentDTO[]>([])
  const load = useCallback(async () => {
    const result = await appCommands.attachments.list(entityType, invoiceId)
    if (result.success && result.data) setFiles(result.data)
  }, [entityType, invoiceId])
  useEffect(() => { void load() }, [load])
  const add = async () => {
    const selected = await appCommands.dialog.openFile([{ name: 'Chứng từ', extensions: ['pdf', 'xml', 'jpg', 'jpeg', 'png'] }])
    if (!selected) return
    const result = await appCommands.attachments.save(entityType, invoiceId, selected)
    if (result.success) { await load(); onChanged?.() }
  }
  return <div className="space-y-2">
    {files.map((file) => <div key={file.id} className="flex items-center justify-between rounded border p-2 text-sm">
      <button className="text-primary-600 hover:underline" onClick={() => void appCommands.attachments.open(file.id)}>{file.originalFilename}</button>
      {editable && <Button size="sm" variant="danger" onClick={() => { void (async () => { await appCommands.attachments.delete(file.id); await load() })() }}>Xóa</Button>}
    </div>)}
    {editable && <Button size="sm" variant="secondary" onClick={() => void add()}>Đính kèm file</Button>}
  </div>
}
