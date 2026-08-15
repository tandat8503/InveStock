import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ToastHost } from '@/components/ui/ToastHost'

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <ToastHost />
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
