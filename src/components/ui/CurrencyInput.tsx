import { useState, useEffect, forwardRef } from 'react'

export interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label?: string
  error?: string
  value: number
  onChange: (value: number) => void
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className = '', label, error, id, value, onChange, ...props }, ref) => {
    const inputId = id || label?.replace(/\s+/g, '-').toLowerCase()
    const [displayValue, setDisplayValue] = useState('')

    useEffect(() => {
      const parsedDisplay = displayValue ? parseInt(displayValue.replace(/\D/g, ''), 10) : 0
      if (parsedDisplay !== value) {
        if (value === 0) {
          setDisplayValue('')
        } else {
          setDisplayValue(new Intl.NumberFormat('vi-VN').format(value))
        }
      }
    }, [value, displayValue])

    const handleBlur = () => {
      setDisplayValue(new Intl.NumberFormat('vi-VN').format(value))
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Remove all non-digits
      const raw = e.target.value.replace(/\D/g, '')
      const num = raw ? parseInt(raw, 10) : 0
      
      // Update display with formatting while typing
      setDisplayValue(raw ? new Intl.NumberFormat('vi-VN').format(num) : '')
      
      // Pass integer to parent
      onChange(num)
    }

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="form-label">
            {label}
            {props.required && <span className="text-danger-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            type="text"
            className={`form-input pr-12 ${error ? 'form-input-error' : ''} ${className}`}
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            {...props}
          />
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <span className="text-gray-500 sm:text-sm">VND</span>
          </div>
        </div>
        {error && <p className="mt-1 text-sm text-danger-500">{error}</p>}
      </div>
    )
  }
)

CurrencyInput.displayName = 'CurrencyInput'
