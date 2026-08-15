import { useEffect, useState } from 'react'
import { Settings, Save, DatabaseBackup, RotateCcw } from 'lucide-react'
import type { AppSettingsDTO, BackupStatusDTO, SupplierDTO } from '@shared/ipc-types'
import { settings as settingsCommands } from '@/lib/commands/settings'
import { backup as backupCommands } from '@/lib/commands/backup'
import { dialogs } from '@/lib/commands/dialogs'
import { app } from '@/lib/commands/app'
import { suppliers as supplierCommands } from '@/lib/commands/suppliers'
import { backupStatusText, commandError, RESTORE_CONFIRMATION } from '@/lib/userFeedback'
import { ConfirmDialog } from '@/components/ui'
import { inventory as inventoryCommands } from '@/lib/commands/inventory'
import type { InventoryDataHealth } from '@shared/ipc-types'
import { useNotify, useUIStore } from '@/stores/uiStore'

function backupFileName(now = new Date()) {
  const date = now.toLocaleDateString('sv-SE')
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '')
  return `InveStock_Backup_${date}_${time}.zip`
}

export function SettingsPage() {
  const notify = useNotify()
  const setSettingsDirty = useUIStore((s) => s.setSettingsDirty)
  const [settings, setSettings] = useState<AppSettingsDTO | null>(null)
  const [originalSettings, setOriginalSettings] = useState<AppSettingsDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')
  const [version, setVersion] = useState<string>('')
  const [backupMessage, setBackupMessage] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupStatus, setBackupStatus] = useState<BackupStatusDTO | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [restorePathFile, setRestorePathFile] = useState<string | null>(null)
  const [health, setHealth] = useState<InventoryDataHealth | null>(null)

  useEffect(() => {
    void loadSettings()
    void loadVersion()
    void loadBackupStatus()
    void supplierCommands.list({ activeOnly: true }).then((result) => {
      if (result.data) setSuppliers(result.data.items)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!settings || !originalSettings) {
      setSettingsDirty(false)
      return
    }
    const isDirty = JSON.stringify(settings) !== JSON.stringify(originalSettings)
    setSettingsDirty(isDirty)
  }, [settings, originalSettings, setSettingsDirty])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (settings && originalSettings && JSON.stringify(settings) !== JSON.stringify(originalSettings)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      setSettingsDirty(false)
    }
  }, [settings, originalSettings, setSettingsDirty])

  async function loadSettings() {
    const result = await settingsCommands.get()
    if (result.success && result.data) {
      setSettings(result.data)
      setOriginalSettings(result.data)
      setSettingsDirty(false)
    }
    const healthRes = await inventoryCommands.checkInventoryDataHealth()
    if (healthRes.success && healthRes.data) {
      setHealth(healthRes.data)
    }
    setLoading(false)
  }

  async function loadBackupStatus() {
    const result = await backupCommands.healthCheck()
    if (result.success && result.data) {
      setBackupStatus(result.data)
      window.dispatchEvent(new Event('backup-updated'))
    }
  }

  async function createBackup() {
    if (backupBusy) return
    setBackupBusy(true)
    setBackupMessage('Đang tạo backup...')
    const destination = await dialogs.saveFile(backupFileName())
    if (typeof destination !== 'string') { setBackupBusy(false); setBackupMessage('Đã hủy tạo backup.'); return }
    const result = await backupCommands.create(destination)
    setBackupMessage(result.success ? `Đã tạo backup an toàn: ${result.data}` : result.error ?? 'Không thể tạo backup.')
    if (result.success) notify.success('Đã tạo bản sao lưu an toàn')
    else notify.error(commandError(result, 'Không thể tạo bản sao lưu.'))
    await loadSettings()
    await loadBackupStatus()
    setBackupBusy(false)
  }

  async function restoreBackup() {
    const file = await dialogs.openFile(['zip'])
    if (file) {
      setRestorePathFile(file)
      setShowRestoreConfirm(true)
    }
  }

  async function executeRestore() {
    if (!restorePathFile || backupBusy) return
    setShowRestoreConfirm(false)
    setBackupBusy(true)
    setBackupMessage('Đang kiểm tra và khôi phục...')
    const result = await backupCommands.restore(restorePathFile)
    setBackupMessage(result.success && result.data ? 'Khôi phục thành công. Vui lòng khởi động lại ứng dụng.' : result.success ? 'Khôi phục không thành công.' : result.error ?? 'Không thể khôi phục backup.')
    if (result.success && result.data) notify.success('Khôi phục thành công. Vui lòng khởi động lại ứng dụng.')
    else notify.error(commandError(result, 'Không thể khôi phục bản sao lưu.'))
    setBackupBusy(false)
    setRestorePathFile(null)
  }

  async function chooseBackupFolder() {
    const folder = await dialogs.selectFolder()
    if (typeof folder !== 'string') return
    if (!settings || !originalSettings) return
    // Use originalSettings as base — not dirty settings — so only the folder is persisted.
    // The user's in-progress form edits are kept in `settings` state and not accidentally saved.
    const updated = await settingsCommands.update({ ...originalSettings, backupFolder: folder })
    if (updated.success && updated.data) {
      // Update the originalSettings baseline so dirty detection stays correct
      setOriginalSettings(updated.data)
      // Mirror the new folder into the current form state to keep form display correct
      setSettings((prev) => prev ? { ...prev, backupFolder: folder } : prev)
      setSettingsDirty(JSON.stringify({ ...settings, backupFolder: folder }) !== JSON.stringify(updated.data))
      notify.success('Đã thay đổi thư mục backup')
    } else {
      setSettingsMessage(updated.error ?? 'Không thể lưu thư mục backup.')
      notify.error(commandError(updated, 'Không thể lưu thư mục backup.'))
    }
    await loadBackupStatus()
  }

  async function loadVersion() {
    setVersion(await app.version())
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    setSettingsMessage('')
    const result = await settingsCommands.update(settings)
    if (result.success && result.data) {
      setSaved(true)
      notify.success('Đã lưu cài đặt')
      setSettings(result.data)
      setOriginalSettings(result.data)
      setSettingsDirty(false)
      setTimeout(() => setSaved(false), 2000)
    } else {
      setSettingsMessage(commandError(result, 'Không thể lưu cài đặt. Vui lòng thử lại.'))
    }
    await loadBackupStatus()
    setSaving(false)
  }

  if (loading) {
    return <div className="p-6 text-gray-500">Đang tải...</div>
  }

  if (!settings) return null

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={24} className="text-primary-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cài đặt</h1>
          <p className="text-sm text-gray-500">Cấu hình dữ liệu và sao lưu ứng dụng</p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSave(e)} className="space-y-6">

        <div className="card p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">Thiết lập bán hàng và tồn kho</h2>
            <p className="text-xs text-gray-500">Giúp tạo phiếu nhanh hơn và cảnh báo hàng sắp hết đúng với cửa hàng.</p>
          </div>
          <div>
            <label className="form-label">Ngưỡng cảnh báo tồn kho thấp mặc định</label>
            <input
              type="number"
              min={1}
              max={100000}
              className="form-input w-40"
              value={settings.lowStockThreshold}
              onChange={(event) => setSettings({ ...settings, lowStockThreshold: Number(event.target.value) })}
            />
            <p className="mt-1 text-xs text-gray-500">Sản phẩm còn bằng hoặc ít hơn mức này sẽ được đánh dấu “Sắp hết”.</p>
          </div>
          <fieldset>
            <legend className="form-label">Nhà cung cấp ưu tiên</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {suppliers.map((supplier) => {
                const selected = settings.preferredSupplierIds.includes(supplier.id)
                return (
                  <label key={supplier.id} className="flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => setSettings({
                        ...settings,
                        preferredSupplierIds: selected
                          ? settings.preferredSupplierIds.filter((id) => id !== supplier.id)
                          : [...settings.preferredSupplierIds, supplier.id],
                      })}
                    />
                    {supplier.companyName}
                  </label>
                )
              })}
            </div>
            {suppliers.length === 0 && <p className="text-sm text-gray-500">Chưa có nhà cung cấp đang hoạt động.</p>}
          </fieldset>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Backup & Dữ liệu</h2>

          <div>
            <label className="form-label">Thư mục backup</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="form-input flex-1"
                value={settings.backupFolder}
                readOnly
                placeholder="Chưa chọn thư mục"
              />
              <button
                type="button"
                className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => void chooseBackupFolder()}
              >
                Chọn
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="autoBackup"
              className="w-4 h-4 text-primary-600 rounded border-gray-300"
              checked={settings.automaticBackupEnabled}
              onChange={(e) => setSettings({ ...settings, automaticBackupEnabled: e.target.checked })}
            />
            <label htmlFor="autoBackup" className="text-sm text-gray-700">
              Tự động backup mỗi ngày
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary inline-flex items-center gap-2 disabled:opacity-50" onClick={() => void createBackup()} disabled={!settings.backupFolder || backupBusy}><DatabaseBackup size={16}/>{backupBusy ? 'Đang xử lý...' : 'Sao lưu ngay'}</button>
            <button type="button" disabled={backupBusy} className="px-3 py-2 border rounded-md text-sm inline-flex items-center gap-2 disabled:opacity-50" onClick={() => void restoreBackup()}><RotateCcw size={16}/>Khôi phục dữ liệu</button>
          </div>
          {backupMessage && <p className="text-sm text-blue-700">{backupMessage}</p>}
          {backupStatus && (
            <div className={`rounded-md p-3 text-sm ${backupStatus.healthy ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
              <p className="font-medium">{backupStatusText(backupStatus).label}</p>
              <p>{backupStatus.message}</p>
              {backupStatusText(backupStatus).warning && <p>{backupStatusText(backupStatus).warning}</p>}
              <p>Backup gần nhất: {backupStatus.lastBackupDate || 'Chưa có'}</p>
            </div>
          )}
          {health && (
            <div className={`rounded-md p-3 text-sm border ${health.isHealthy ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-800 border-red-200'} space-y-1`}>
              <p className="font-bold">
                {health.isHealthy ? 'Chẩn đoán dữ liệu tồn kho: An toàn' : 'Cảnh báo: Phát hiện lỗi lệch dữ liệu tồn kho (ORPHAN_CURRENT_STOCK)'}
              </p>
              {health.orphanDetails ? (
                <p className="text-xs font-mono whitespace-pre-wrap mt-1 text-red-600 bg-red-100/50 p-2 rounded border border-red-150">{health.orphanDetails}</p>
              ) : (
                <p className="text-xs text-green-600">Mọi sản phẩm có tồn kho đều khớp với lịch sử nhập/xuất hoặc số dư khởi tạo.</p>
              )}
              {!health.isHealthy && (
                <p className="text-xs text-gray-500 font-semibold mt-1">Gợi ý: Hãy khôi phục dữ liệu từ bản sao lưu khởi tạo hoặc liên hệ hỗ trợ kỹ thuật.</p>
              )}
            </div>
          )}
          {settings.lastBackupError && <p className="text-xs text-red-600 mt-1">Lỗi auto-backup: {settings.lastBackupError}</p>}
        </div>

        {/* Developer Seed Panel */}

        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
          >
            <Save size={16} />
            {saving ? 'Đang lưu...' : saved ? 'Đã lưu!' : 'Lưu cài đặt'}
          </button>
          <p className="text-xs text-gray-400">Phiên bản {version || 'Đang tải...'}</p>
        </div>
        {settingsMessage && <p role="alert" className="text-sm text-red-600">{settingsMessage}</p>}
      </form>
      <ConfirmDialog
        isOpen={showRestoreConfirm}
        title="Khôi phục dữ liệu từ bản sao lưu?"
        message={RESTORE_CONFIRMATION}
        confirmText="Xác nhận Khôi phục"
        cancelText="Quay lại"
        type="danger"
        isLoading={backupBusy}
        onConfirm={() => { void executeRestore() }}
        onCancel={() => {
          setShowRestoreConfirm(false)
          setRestorePathFile(null)
        }}
      />
    </div>
  )
}
