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
    // w-60 (240px) — Hr-management standard
    <aside className="w-60 bg-sidebar-bg flex flex-col h-full flex-shrink-0 select-none">
      {/* Logo / App Name */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-slate-800">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary-600 shadow-lg shadow-primary-600/30">
          <Package size={20} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white leading-tight">InveStock</p>
          <p className="text-xs text-slate-400 leading-tight">Quản lý kho</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
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
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-primary-600 text-white shadow-md shadow-primary-600/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  size={18}
                  className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`}
                />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer — backup status + version */}
      <div className="px-5 py-4 border-t border-slate-800">
        {backupStatus && (
          <NavLink
            to="/settings"
            title={backupStatus.message}
            className="mb-2 flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <span
              className={`h-2 w-2 flex-shrink-0 rounded-full ${
                backupStatus.healthy && !backupStatus.usingFallback ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span className="truncate">{backupStatusText(backupStatus).label}</span>
          </NavLink>
        )}
        <p className="text-xs text-slate-600">{version ? `v${version}` : ''}</p>
      </div>

      {/* Unsaved Settings Dialog (Option A: no fake Save button) */}
      <UnsavedChangesDialog
        isOpen={pendingNav !== null}
        mode="entity"
        onSave={undefined}
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
