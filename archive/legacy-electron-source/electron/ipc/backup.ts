import { shell, type IpcMain } from 'electron'
import { handle } from './utils'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import {
  createBackup,
  getBackupStorageStats,
  listBackups,
  restoreBackup,
} from '../services/backupService'
import { getSettingsRepository } from '../repositories/settingsRepository'

export function registerBackupHandlers(ipcMain: IpcMain): void {
  handle(ipcMain, IPC_CHANNELS.BACKUP_CREATE, async () => {
    const settings = await getSettingsRepository().getAll()
    if (!settings.backupFolder) throw new Error('Vui lòng chọn thư mục backup')
    return createBackup(settings.backupFolder)
  })
  handle(ipcMain, IPC_CHANNELS.BACKUP_RESTORE, (_event, zipPath) =>
    restoreBackup(String(zipPath)))
  handle(ipcMain, IPC_CHANNELS.BACKUP_LIST, async () => {
    const settings = await getSettingsRepository().getAll()
    return listBackups(settings.backupFolder)
  })
  handle(ipcMain, IPC_CHANNELS.BACKUP_STORAGE_STATS, async () => {
    const settings = await getSettingsRepository().getAll()
    return getBackupStorageStats(settings.backupFolder)
  })
  handle(ipcMain, IPC_CHANNELS.BACKUP_OPEN_FOLDER, async () => {
    const settings = await getSettingsRepository().getAll()
    if (!settings.backupFolder) throw new Error('Chưa chọn thư mục backup')
    const error = await shell.openPath(settings.backupFolder)
    if (error) throw new Error(error)
  })
}
