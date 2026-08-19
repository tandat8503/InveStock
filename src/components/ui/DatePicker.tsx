import { useState, useRef, useEffect } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isSameDay,
  isToday,
  isValid,
  parse
} from 'date-fns'

export interface DatePickerProps {
  value: string // YYYY-MM-DD format
  onChange: (value: string) => void // emits YYYY-MM-DD or ""
  placeholder?: string
  disabled?: boolean
  label?: string
  error?: string
  required?: boolean
  id?: string
  allowClear?: boolean
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Chọn ngày',
  disabled = false,
  label,
  error,
  required = false,
  id,
  allowClear = true
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    if (value) {
      const parsed = parseISO(value)
      if (isValid(parsed)) return parsed
    }
    return new Date()
  })
  
  const [inputValue, setInputValue] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Update input text when value changes
  useEffect(() => {
    if (value) {
      const parsed = parseISO(value)
      if (isValid(parsed)) {
        setInputValue(format(parsed, 'dd/MM/yyyy'))
        setCurrentMonth(parsed)
        return
      }
    }
    setInputValue('')
  }, [value])

  // Handle outside clicks to close the calendar popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Parse and commit manual typing
  const commitManualInput = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) {
      if (!required) onChange('')
      return
    }

    // Try parsing dd/MM/yyyy
    const parsed = parse(trimmed, 'dd/MM/yyyy', new Date())
    if (isValid(parsed) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
      onChange(format(parsed, 'yyyy-MM-dd'))
    } else {
      // Revert to current formatted value
      if (value) {
        const valDate = parseISO(value)
        if (isValid(valDate)) {
          setInputValue(format(valDate, 'dd/MM/yyyy'))
        }
      } else {
        setInputValue('')
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitManualInput(inputValue)
      setIsOpen(false)
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  const handleBlur = () => {
    commitManualInput(inputValue)
  }

  const handleSelectDay = (date: Date) => {
    onChange(format(date, 'yyyy-MM-dd'))
    setIsOpen(false)
  }

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => subMonths(prev, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, 1))
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setInputValue('')
  }

  // Generate calendar days
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }) // Monday
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const days = eachDayOfInterval({ start: startDate, end: endDate })
  const weekdays = ['Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'CN']

  const selectedDate = value ? parseISO(value) : null

  return (
    <div className="w-full relative" ref={containerRef}>
      {label && (
        <label className="form-label">
          {label}
          {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          disabled={disabled}
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => {
            if (!disabled) setIsOpen(true)
          }}
          className={`form-input text-center px-9 cursor-pointer ${error ? 'form-input-error' : ''}`}
        />

        {/* Clear Button */}
        {allowClear && value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-9 text-slate-400 hover:text-slate-600 transition-colors p-1"
            title="Xóa ngày"
          >
            <X size={14} />
          </button>
        )}

        {/* Calendar Trigger Icon */}
        <button
          type="button"
          onClick={() => {
            if (!disabled) setIsOpen(!isOpen)
          }}
          disabled={disabled}
          className="absolute right-2.5 flex items-center justify-center text-slate-400 hover:text-primary-600 transition-colors"
        >
          <CalendarIcon size={16} />
        </button>

        {/* Calendar Popover */}
        {isOpen && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>

              <span className="text-xs font-bold text-slate-700 uppercase">
                {format(currentMonth, 'MMMM yyyy')}
              </span>

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Weekdays */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase mb-1">
              {weekdays.map((day) => (
                <div key={day} className="py-0.5">
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth()
                const isSel = selectedDate && isSameDay(day, selectedDate)
                const isTod = isToday(day)

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    className={`h-7 w-7 text-xs rounded-full flex items-center justify-center transition-all ${
                      !isCurrentMonth
                        ? 'text-slate-300 hover:bg-slate-50'
                        : isSel
                        ? 'bg-primary-600 text-white font-semibold'
                        : isTod
                        ? 'bg-primary-50 border border-primary-200 text-primary-700 font-semibold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  )
}
