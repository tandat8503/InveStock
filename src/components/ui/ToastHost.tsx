import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import type { Notification } from '@/stores/uiStore'
import { Portal } from './Portal'

const styles = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-primary-600 text-white',
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

export function ToastList({
  notifications,
  onRemove,
}: {
  notifications: Notification[]
  onRemove: (id: string) => void
}) {
  return (
    <Portal>
      {/* z-[300] — always above everything, bottom-right per Hr-management */}
      <div
        className="pointer-events-none fixed right-6 bottom-6 z-[300] flex w-[min(22rem,calc(100vw-3rem))] flex-col gap-2"
        aria-live="polite"
        aria-label="Thông báo"
      >
        {notifications.map((notification) => {
          const Icon = icons[notification.type]
          return (
            <div
              key={notification.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-xl ${styles[notification.type]}`}
            >
              <Icon className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
              <p className="flex-1 text-sm font-medium leading-snug">{notification.message}</p>
              <button
                type="button"
                aria-label="Đóng thông báo"
                onClick={() => onRemove(notification.id)}
                className="mt-0.5 rounded p-0.5 opacity-70 hover:opacity-100 transition-opacity"
              >
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </Portal>
  )
}
