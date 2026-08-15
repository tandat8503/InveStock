import type { IpcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { handle } from './utils'
import { getSupplierRepository } from '../repositories/supplierRepository'
import {
  createSupplierSchema,
  updateSupplierSchema,
} from '../../shared/schemas'

export function registerSupplierHandlers(ipcMain: IpcMain): void {
  handle(ipcMain, IPC_CHANNELS.SUPPLIER_LIST, async (_event, params) => {
    return getSupplierRepository().list(params as { search?: string; activeOnly?: boolean })
  })

  handle(ipcMain, IPC_CHANNELS.SUPPLIER_GET, async (_event, id) => {
    return getSupplierRepository().getById(id as number)
  })

  handle(ipcMain, IPC_CHANNELS.SUPPLIER_CREATE, async (_event, input) => {
    const parsed = createSupplierSchema.parse(input)
    return getSupplierRepository().create(parsed)
  })

  handle(ipcMain, IPC_CHANNELS.SUPPLIER_UPDATE, async (_event, input) => {
    const parsed = updateSupplierSchema.parse(input)
    return getSupplierRepository().update(parsed)
  })

  handle(ipcMain, IPC_CHANNELS.SUPPLIER_TOGGLE_ACTIVE, async (_event, id) => {
    return getSupplierRepository().toggleActive(id as number)
  })

  handle(ipcMain, IPC_CHANNELS.SUPPLIER_DELETE, async (_event, id) => {
    return getSupplierRepository().safeDelete(id as number)
  })

  handle(ipcMain, IPC_CHANNELS.SUPPLIER_STATS, async (_event, id) => {
    return getSupplierRepository().getWithStats(id as number)
  })

  handle(ipcMain, IPC_CHANNELS.SUPPLIER_INVOICES, async (_event, id, params) => {
    return getSupplierRepository().getInvoices(id as number, params as Record<string, unknown>)
  })

  handle(ipcMain, IPC_CHANNELS.SUPPLIER_PAYMENTS, async (_event, id) => {
    return getSupplierRepository().getPayments(id as number)
  })
}
