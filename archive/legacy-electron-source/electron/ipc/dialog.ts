import type { IpcMain } from 'electron'
import { dialog } from 'electron'

export function registerDialogHandlers(ipcMain: IpcMain): void {
  // Dialog handlers are registered in attachments.ts
  // This file handles any additional dialog needs
  ipcMain.handle('dialog:openBackupFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Backup Files', extensions: ['zip'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
