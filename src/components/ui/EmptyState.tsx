import { FileBox } from 'lucide-react'

export interface EmptyStateProps {
  title?: string
  message?: string
  action?: React.ReactNode
}

export function EmptyState({
  title = 'Không có dữ liệu',
  message = 'Chưa có dữ liệu nào để hiển thị',
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-lg border border-gray-200 border-dashed">
      <FileBox size={48} className="text-gray-300 mb-4" />
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
