import { AlertCircle } from 'lucide-react'
import { Button } from './Button'

export interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-lg border border-danger-200">
      <AlertCircle size={48} className="text-danger-400 mb-4" />
      <h3 className="text-sm font-medium text-danger-900">Đã xảy ra lỗi</h3>
      <p className="mt-1 text-sm text-danger-600 max-w-md">{message}</p>
      {onRetry && (
        <div className="mt-6">
          <Button variant="secondary" onClick={onRetry}>
            Thử lại
          </Button>
        </div>
      )}
    </div>
  )
}
