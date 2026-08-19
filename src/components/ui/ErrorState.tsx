import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from './Button'

export interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
        <AlertCircle size={32} className="text-red-500" />
      </div>
      <h3 className="text-sm font-semibold text-slate-700">Đã xảy ra lỗi</h3>
      <p className="mt-1.5 text-sm text-slate-500 max-w-md">{message}</p>
      {onRetry && (
        <div className="mt-6">
          <Button variant="secondary" onClick={onRetry}>
            <RefreshCw size={14} />
            Thử lại
          </Button>
        </div>
      )}
    </div>
  )
}
