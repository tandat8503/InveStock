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
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
        <FileBox size={32} className="text-slate-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-500 max-w-xs">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
