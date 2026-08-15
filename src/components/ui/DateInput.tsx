import { forwardRef } from 'react'
import { Calendar } from 'lucide-react'

export interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  label?: string
  error?: string
  value: string // YYYY-MM-DD format
  onChange: (value: string) => void // emits YYYY-MM-DD
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ className = '', label, error, id, value, onChange, disabled, required, ...props }, ref) => {
    const inputId = id || label?.replace(/\s+/g, '-').toLowerCase() || 'date-input'

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="form-label">
            {label}
            {required && <span className="text-danger-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {/* Single real date input — works natively in Tauri macOS WebKit */}
          <input
            ref={ref}
            id={inputId}
            type="date"
            value={value}
            disabled={disabled}
            required={required}
            onChange={(e) => onChange(e.target.value)}
            className={`form-input date-input-centered text-center px-9 cursor-pointer ${
              error ? 'form-input-error' : ''
            } ${className}`}
            {...props}
          />

          {/* Calendar icon as label — clicking it focuses/opens the same input */}
          <label
            htmlFor={inputId}
            className={`absolute right-2.5 flex items-center justify-center transition-colors ${
              disabled
                ? 'text-gray-300 cursor-not-allowed pointer-events-none'
                : 'text-gray-400 hover:text-primary-600 cursor-pointer'
            }`}
            aria-hidden="true"
          >
            <Calendar size={16} />
          </label>
        </div>

        {error && <p className="mt-1 text-sm text-danger-500">{error}</p>}
      </div>
    )
  }
)

DateInput.displayName = 'DateInput'
