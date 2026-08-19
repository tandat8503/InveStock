import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Portal } from './Portal'

// Reference-counted body scroll lock.
// Multiple modals can stack without fighting over document.body.style.overflow.
let scrollLockCount = 0
function lockScroll() {
  scrollLockCount++
  if (scrollLockCount === 1) {
    document.body.style.overflow = 'hidden'
  }
}
function unlockScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0) {
    document.body.style.overflow = ''
  }
}

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const closedRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return

    closedRef.current = false
    lockScroll()

    const handleEscape = (e: KeyboardEvent) => {
      // Only respond if no higher-z dialog is consuming this event
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      unlockScroll()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <Portal>
      {/* Overlay – z-[100] so ConfirmDialog/UnsavedChangesDialog can sit at z-[200] above */}
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40"
          aria-hidden="true"
          onClick={onClose}
        />

        {/* Panel — NO overflow-hidden here (that was the root cause of the clipping bug) */}
        <div
          className={`relative flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-2xl ${sizeClasses[size]}`}
        >
          {/* Header */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
            <h3 className="text-base font-semibold text-slate-900" id="modal-title">
              {title}
            </h3>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
              onClick={onClose}
              aria-label="Đóng"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  )
}
