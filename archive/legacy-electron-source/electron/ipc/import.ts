import type { IpcMain } from 'electron'
import { handle } from './utils'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { importExecuteRequestSchema, importValidateRequestSchema } from '../../shared/schemas'
import { importService } from '../services/importService'

export function registerImportHandlers(ipcMain: IpcMain): void {
  handle(ipcMain, IPC_CHANNELS.IMPORT_PARSE_FILE, (_event, filePath) =>
    importService.parseFile(String(filePath)))
  handle(ipcMain, IPC_CHANNELS.IMPORT_VALIDATE, (_event, input) =>
    importService.validate(importValidateRequestSchema.parse(input)))
  handle(ipcMain, IPC_CHANNELS.IMPORT_EXECUTE, (_event, input) =>
    importService.execute(importExecuteRequestSchema.parse(input)))
  handle(ipcMain, IPC_CHANNELS.IMPORT_CANCEL, (_event, importSessionId) =>
    importService.cancel(String(importSessionId)))
  handle(ipcMain, IPC_CHANNELS.IMPORT_HISTORY, (_event, limit) =>
    importService.history(typeof limit === 'number' ? limit : undefined))
  handle(ipcMain, IPC_CHANNELS.IMPORT_EXPORT_ERROR_REPORT, (_event, importSessionId, filePath) =>
    importService.exportErrors(String(importSessionId), String(filePath)))
}
