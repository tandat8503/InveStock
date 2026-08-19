import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Portal } from './Portal'

export type UnsavedChangesMode = 'entity' | 'draft' | 'adjustment'

export interface UnsavedChangesDialogProps {
  isOpen: boolean
  mode?: UnsavedChangesMode
  /** Called when user clicks Lưu thay đổi / Lưu nháp — must trigger actual save. Not available for mode="adjustment" */
  onSave?: () => void | Promise<void>
  /** Called when user clicks Thoát không lưu / Bỏ thay đổi */
  onDiscard: () => void
  /** Called when user clicks Tiếp tục chỉnh sửa (also Escape / backdrop click) */
  onContinue: () => void
}

const labels: Record<UnsavedChangesMode, { title: string; description: string; save?: string; discard: string; continue: string }> = {
  entity: {
    title: 'Bạn có thay đổi chưa lưu',
    description: 'Dữ liệu bạn vừa nhập chưa được lưu. Bạn muốn làm gì trước khi đóng biểu mẫu?',
    save: 'Lưu thay đổi',
    discard: 'Thoát không lưu',
    continue: 'Tiếp tục chỉnh sửa',
  },
  draft: {
    title: 'Bạn có thay đổi chưa lưu',
    description: 'Phiếu chưa được lưu. Bạn muốn làm gì trước khi đóng?',
    save: 'Lưu nháp',
    discard: 'Thoát không lưu',
    continue: 'Tiếp tục chỉnh sửa',
  },
  adjustment: {
    title: 'Bạn có thay đổi chưa lưu',
    description: 'Các thay đổi của bạn sẽ bị mất nếu bạn rời khỏi phần này.',
    // no save — adjustment requires its own confirm flow
    discard: 'Bỏ thay đổi',
    continue: 'Tiếp tục chỉnh sửa',
  },
}

/**
 * 3-way unsaved changes dialog.
 *
 * - mode="entity"     → Lưu thay đổi / Thoát không lưu / Tiếp tục chỉnh sửa
 * - mode="draft"      → Lưu nháp / Thoát không lưu / Tiếp tục chỉnh sửa
 * - mode="adjustment" → Bỏ thay đổi / Tiếp tục chỉnh sửa  (no save)
 *
 * Escape key and backdrop click → onContinue (safest — keeps user's work).
 * Rendered via Portal at z-[200] — always above Modal (z-[100]).
 */
export function UnsavedChangesDialog({
  isOpen,
  mode = 'entity',
  onSave,
  onDiscard,
  onContinue,
}: UnsavedChangesDialogProps) {
  // Escape key handler — capture phase so this dialog takes priority over any parent Modal
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onContinue()
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [isOpen, onContinue])

  if (!isOpen) return null

  const config = labels[mode]
  const showSave = mode !== 'adjustment' && !!onSave

  return (
    <Portal>
      {/* z-[200] — always above Modal (z-[100]) */}
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-dialog-title"
      >
        {/* Backdrop — clicking it continues editing (keeps user's work) */}
        <div
          className="absolute inset-0 bg-black/50"
          onClick={onContinue}
          aria-hidden="true"
        />

        <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          {/* Icon */}
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />
          </div>

          <h2 className="text-base font-semibold text-slate-900" id="unsaved-dialog-title">
            {config.title}
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            {config.description}
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            {showSave && (
              <button
                type="button"
                onClick={() => { void onSave?.() }}
                className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
              >
                {config.save}
              </button>
            )}
            <button
              type="button"
              onClick={onDiscard}
              className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
            >
              {config.discard}
            </button>
            <button
              type="button"
              onClick={onContinue}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1"
            >
              {config.continue}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
