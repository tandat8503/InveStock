import type { IpcMain } from 'electron'
import { registerProductHandlers } from './products'
import { registerSupplierHandlers } from './suppliers'
import { registerPurchaseHandlers } from './purchases'
import { registerSaleHandlers } from './sales'
import { registerInventoryHandlers } from './inventory'
import { registerSettingsHandlers } from './settings'
import { registerAttachmentHandlers } from './attachments'
import { registerBackupHandlers } from './backup'
import { registerReportHandlers } from './reports'
import { registerImportHandlers } from './import'
import { registerDashboardHandlers } from './dashboard'
import { registerDialogHandlers } from './dialog'
import { registerAppHandlers } from './app'

export function registerAllIpcHandlers(ipcMain: IpcMain): void {
  registerProductHandlers(ipcMain)
  registerSupplierHandlers(ipcMain)
  registerPurchaseHandlers(ipcMain)
  registerSaleHandlers(ipcMain)
  registerInventoryHandlers(ipcMain)
  registerSettingsHandlers(ipcMain)
  registerAttachmentHandlers(ipcMain)
  registerBackupHandlers(ipcMain)
  registerReportHandlers(ipcMain)
  registerImportHandlers(ipcMain)
  registerDashboardHandlers(ipcMain)
  registerDialogHandlers(ipcMain)
  registerAppHandlers(ipcMain)
}
