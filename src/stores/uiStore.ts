import { create } from 'zustand'

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Notifications
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void

  // Global loading
  globalLoading: boolean
  setGlobalLoading: (loading: boolean) => void

  // Settings dirty guard
  isSettingsDirty: boolean
  setSettingsDirty: (dirty: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  notifications: [],
  addNotification: (notification) => {
    const id = Date.now().toString()
    set((state) => ({
      notifications: [...state.notifications, { ...notification, id }],
    }))
    // Auto-remove after duration (default 4000ms)
    const duration = notification.duration ?? 4000
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }))
      }, duration)
    }
  },
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  globalLoading: false,
  setGlobalLoading: (loading) => set({ globalLoading: loading }),

  isSettingsDirty: false,
  setSettingsDirty: (dirty) => set({ isSettingsDirty: dirty }),
}))

// Convenience hook for notifications
export function useNotify() {
  const addNotification = useUIStore((s) => s.addNotification)
  return {
    success: (message: string) => addNotification({ type: 'success', message }),
    error: (message: string) => addNotification({ type: 'error', message, duration: 6000 }),
    warning: (message: string) => addNotification({ type: 'warning', message }),
    info: (message: string) => addNotification({ type: 'info', message }),
  }
}
