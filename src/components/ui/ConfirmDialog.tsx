import React, { useEffect } from 'react'
import { AlertTriangle, Info, AlertCircle } from 'lucide-react'
import { Button } from './Button'
import { Portal } from './Portal'

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
  // Capture Escape at capture phase so this dialog takes priority over any parent Modal
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const icons = {
    danger: <AlertCircle className="h-6 w-6 text-red-600" aria-hidden="true" />,
    warning: <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />,
    info: <Info className="h-6 w-6 text-blue-600" aria-hidden="true" />,
  }

  const iconBg = {
    danger: 'bg-red-100',
    warning: 'bg-amber-100',
    info: 'bg-blue-100',
  }

  const btnVariant = {
    danger: 'danger',
    warning: 'primary',
    info: 'primary',
  } as const

  return (
    <Portal>
      {/* z-[200] — always above Modal (z-[100]) */}
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        {/* Backdrop — clicking cancels (safe: no destructive action on backdrop) */}
        <div
          className="absolute inset-0 bg-black/50"
          aria-hidden="true"
          onClick={onCancel}
        />

        <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-start gap-4">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${iconBg[type]}`}>
              {icons[type]}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-slate-900" id="confirm-dialog-title">
                {title}
              </h3>
              <div className="mt-1.5 text-sm text-slate-500">
                {message}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
              {cancelText}
            </Button>
            <Button variant={btnVariant[type]} onClick={onConfirm} isLoading={isLoading}>
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
