import { useEffect } from 'react'

export type UnsavedChangesMode = 'entity' | 'draft' | 'adjustment'

export interface UnsavedChangesDialogProps {
  isOpen: boolean
  mode?: UnsavedChangesMode
  /** Called when user clicks Save / Lưu nháp — not available for mode="adjustment" */
  onSave?: () => void
  /** Called when user clicks Discard / Bỏ thay đổi */
  onDiscard: () => void
  /** Called when user clicks Continue / Tiếp tục chỉnh sửa (also Escape / backdrop) */
  onContinue: () => void
}

const labels: Record<UnsavedChangesMode, { title: string; save?: string; discard: string; continue: string }> = {
  entity: {
    title: 'Bạn có thay đổi chưa lưu',
    save: 'Lưu thay đổi',
    discard: 'Thoát không lưu',
    continue: 'Tiếp tục chỉnh sửa',
  },
  draft: {
    title: 'Bạn có thay đổi chưa lưu',
    save: 'Lưu nháp',
    discard: 'Thoát không lưu',
    continue: 'Tiếp tục chỉnh sửa',
  },
  adjustment: {
    title: 'Bạn có thay đổi chưa lưu',
    // no save — adjustment requires its own confirm flow
    discard: 'Bỏ thay đổi',
    continue: 'Tiếp tục chỉnh sửa',
  },
}

/**
 * 3-way unsaved changes dialog.
 *
 * - mode="entity"    → Lưu thay đổi / Thoát không lưu / Tiếp tục chỉnh sửa
 * - mode="draft"     → Lưu nháp / Thoát không lưu / Tiếp tục chỉnh sửa
 * - mode="adjustment" → Bỏ thay đổi / Tiếp tục chỉnh sửa  (no save)
 *
 * Escape key and backdrop click → onContinue (safest — keeps user's work).
 * Only the topmost dialog responds to Escape.
 */
export function UnsavedChangesDialog({
  isOpen,
  mode = 'entity',
  onSave,
  onDiscard,
  onContinue,
}: UnsavedChangesDialogProps) {
  // Escape key handler — only fire when this dialog is open and topmost
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
  const showSave = mode !== 'adjustment' && onSave

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={config.title}
    >
      {/* Backdrop — clicking it continues editing (keeps work) */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onContinue}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
        {/* Icon */}
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
          <svg
            className="h-6 w-6 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>

        <h2 className="text-base font-semibold text-gray-900">{config.title}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {mode === 'adjustment'
            ? 'Các thay đổi của bạn sẽ bị mất nếu bạn rời khỏi phần này.'
            : 'Dữ liệu bạn vừa nhập chưa được lưu.'}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {showSave && (
            <button
              type="button"
              onClick={onSave}
              className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 transition-colors"
            >
              {config.save}
            </button>
          )}
          <button
            type="button"
            onClick={onDiscard}
            className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors"
          >
            {config.discard}
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors"
          >
            {config.continue}
          </button>
        </div>
      </div>
    </div>
  )
}
