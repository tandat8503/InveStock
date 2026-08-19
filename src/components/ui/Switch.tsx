import React from 'react'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  id?: string
}

/**
 * Switch / Toggle component.
 * Track: 44 × 24px. Knob: 20 × 20px.
 * Smooth transition, clear ON/OFF states, keyboard accessible.
 */
export function Switch({ checked, onChange, label, description, disabled = false, id }: SwitchProps) {
  const switchId = id ?? (label ? `switch-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)

  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        id={switchId}
        aria-checked={checked}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => { if (!disabled) onChange(!checked) }}
        className={[
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors duration-200 ease-in-out',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
          checked ? 'bg-primary-600' : 'bg-slate-200',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ].filter(Boolean).join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0',
            'transition-transform duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>

      {(label ?? description) && (
        <div className="min-w-0">
          {label && (
            <label
              htmlFor={switchId}
              className={`text-sm font-medium ${disabled ? 'text-slate-400' : 'text-slate-700'} cursor-pointer`}
            >
              {label}
            </label>
          )}
          {description && (
            <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          )}
        </div>
      )}
    </div>
  )
}
