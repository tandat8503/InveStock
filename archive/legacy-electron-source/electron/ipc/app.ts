import type { IpcMain } from 'electron'
import { app, shell } from 'electron'
import { handle } from './utils'
import { IPC_CHANNELS } from '../../shared/ipc-types'

export function registerAppHandlers(ipcMain: IpcMain): void {
  handle(ipcMain, IPC_CHANNELS.APP_VERSION, () => {
    return app.getVersion()
  })

  handle(ipcMain, IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_event, url) => {
    await shell.openExternal(url as string)
  })
}
