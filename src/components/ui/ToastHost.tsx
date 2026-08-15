import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import type { Notification } from '@/stores/uiStore'

const styles = {
  success: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
}

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

export function ToastHost() {
  const notifications = useUIStore((state) => state.notifications)
  const removeNotification = useUIStore((state) => state.removeNotification)
  return <ToastList notifications={notifications} onRemove={removeNotification} />
}

export function ToastList({ notifications, onRemove }: { notifications: Notification[]; onRemove: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {notifications.map((notification) => {
        const Icon = icons[notification.type]
        return (
          <div key={notification.id} role="status" className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3 shadow-lg ${styles[notification.type]}`}>
            <Icon className="mt-0.5 shrink-0" size={18} />
            <p className="flex-1 text-sm font-medium">{notification.message}</p>
            <button type="button" aria-label="Đóng thông báo" onClick={() => onRemove(notification.id)} className="rounded p-0.5 opacity-60 hover:opacity-100"><X size={15} /></button>
          </div>
        )
      })}
    </div>
  )
}
