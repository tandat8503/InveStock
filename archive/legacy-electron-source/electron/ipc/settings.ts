import { dialog, type IpcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { handle } from './utils'
import { getSettingsRepository } from '../repositories/settingsRepository'

export function registerSettingsHandlers(ipcMain: IpcMain): void {
  handle(ipcMain, IPC_CHANNELS.SETTINGS_GET, async () => {
    const repo = getSettingsRepository()
    return repo.getAll()
  })

  handle(ipcMain, IPC_CHANNELS.SETTINGS_UPDATE, async (_event, settings) => {
    const repo = getSettingsRepository()
    return repo.updateAll(settings as Record<string, unknown>)
  })

  handle(ipcMain, IPC_CHANNELS.SETTINGS_CHOOSE_FOLDER, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
}
