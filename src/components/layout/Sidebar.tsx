import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { app } from '@/lib/commands/app'
import { backup } from '@/lib/commands/backup'
import type { BackupStatusDTO } from '@shared/ipc-types'
import { backupStatusText } from '@/lib/userFeedback'
import { useUIStore } from '@/stores/uiStore'
import { UnsavedChangesDialog } from '@/components/ui'
import {
  LayoutDashboard,
  Package,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  FileText,
  PieChart,
  Settings,
  ChevronRight,
} from 'lucide-react'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/products', icon: Package, label: 'Sản phẩm' },
  { to: '/suppliers', icon: Users, label: 'Nhà cung cấp' },
  { to: '/purchases', icon: ArrowDownToLine, label: 'Nhập kho' },
  { to: '/sales', icon: ArrowUpFromLine, label: 'Xuất kho' },
  { to: '/inventory', icon: BarChart3, label: 'Tồn kho' },
  { to: '/invoices', icon: FileText, label: 'Hóa đơn' },
  { to: '/reports', icon: PieChart, label: 'Báo cáo' },
  { to: '/settings', icon: Settings, label: 'Cài đặt' },
]

export function Sidebar() {
  const isSettingsDirty = useUIStore((s) => s.isSettingsDirty)
  const setSettingsDirty = useUIStore((s) => s.setSettingsDirty)
  const location = useLocation()
  const navigate = useNavigate()
  const [version, setVersion] = useState('')
  const [backupStatus, setBackupStatus] = useState<BackupStatusDTO | null>(null)
  const [pendingNav, setPendingNav] = useState<string | null>(null)

  useEffect(() => {
    void app.version().then(setVersion)
  }, [])

  const queryBackupStatus = () => {
    void backup.status().then((result) => { if (result.data) setBackupStatus(result.data) })
  }

  useEffect(() => {
    queryBackupStatus()
  }, [location])

  useEffect(() => {
    window.addEventListener('backup-updated', queryBackupStatus)
    return () => window.removeEventListener('backup-updated', queryBackupStatus)
  }, [])

  return (
    <aside className="w-56 bg-sidebar-bg flex flex-col h-full flex-shrink-0">
      {/* Logo / App name */}
      <div className="px-4 py-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
            <Package size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold leading-tight truncate">InveStock</p>
            <p className="text-sidebar-text text-xs leading-tight">Quản lý kho</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            data-testid={`nav-${item.to.slice(1)}`}
            key={item.to}
            to={item.to}
            onClick={(e) => {
              if (isSettingsDirty) {
                e.preventDefault()
                setPendingNav(item.to)
              }
            }}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors duration-150 group ${
                isActive
                  ? 'bg-primary-600 text-white font-medium'
                  : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={16} className={isActive ? 'text-white' : 'text-sidebar-text group-hover:text-white'} />
                <span className="flex-1 truncate">{item.label}</span>
                {isActive && <ChevronRight size={14} className="text-white opacity-60" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom info */}
      <div className="px-4 py-3 border-t border-slate-700">
        {backupStatus && (
          <NavLink to="/settings" title={backupStatus.message} className="mb-2 flex items-center gap-2 text-xs text-sidebar-text hover:text-white">
            <span className={`h-2 w-2 rounded-full ${backupStatus.healthy && !backupStatus.usingFallback ? 'bg-green-400' : 'bg-amber-400'}`} />
            <span>{backupStatusText(backupStatus).label}</span>
          </NavLink>
        )}
        <p className="text-sidebar-text text-xs">{version ? `v${version}` : ''}</p>
      </div>

      {/* Unsaved Settings Dialog — replaces window.confirm */}
      <UnsavedChangesDialog
        isOpen={pendingNav !== null}
        mode="entity"
        onSave={() => {
          // Navigate to settings so user can save first
          setPendingNav(null)
        }}
        onDiscard={() => {
          setSettingsDirty(false)
          if (pendingNav) navigate(pendingNav)
          setPendingNav(null)
        }}
        onContinue={() => setPendingNav(null)}
      />
    </aside>
  )
}
