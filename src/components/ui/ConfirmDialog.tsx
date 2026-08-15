import { Modal } from './Modal'
import { Button } from './Button'
import { AlertTriangle, Info, AlertCircle } from 'lucide-react'

export interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string | React.ReactNode
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  type = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const icons = {
    danger: <AlertCircle className="h-6 w-6 text-danger-600" aria-hidden="true" />,
    warning: <AlertTriangle className="h-6 w-6 text-warning-600" aria-hidden="true" />,
    info: <Info className="h-6 w-6 text-blue-600" aria-hidden="true" />,
  }

  const iconBg = {
    danger: 'bg-danger-100',
    warning: 'bg-warning-100',
    info: 'bg-blue-100',
  }

  const btnVariant = {
    danger: 'danger',
    warning: 'primary',
    info: 'primary',
  } as const

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title=""
      size="sm"
      footer={
        <>
          <Button variant={btnVariant[type]} onClick={onConfirm} isLoading={isLoading}>
            {confirmText}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            {cancelText}
          </Button>
        </>
      }
    >
      <div className="sm:flex sm:items-start pt-2">
        <div className={`mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full sm:mx-0 sm:h-10 sm:w-10 ${iconBg[type]}`}>
          {icons[type]}
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
          <h3 className="text-lg font-medium leading-6 text-gray-900">{title}</h3>
          <div className="mt-2">
            <p className="text-sm text-gray-500">{message}</p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
