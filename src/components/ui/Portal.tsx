import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Portal – renders children directly into document.body.
 *
 * Use this for Modal, ConfirmDialog, UnsavedChangesDialog and Toast so they
 * are never clipped by a parent's overflow-hidden or transform context.
 */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return children
  return createPortal(children, document.body)
}
