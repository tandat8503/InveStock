import type { IpcMain } from 'electron'
import { handle } from './utils'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import {
  createSalesInvoiceSchema,
  updateSalesInvoiceSchema,
  cancelSaleSchema,
} from '../../shared/schemas'
import { getSaleRepository } from '../repositories/saleRepository'
import { getSaleService } from '../services/saleService'

export function registerSaleHandlers(ipcMain: IpcMain): void {
  handle(ipcMain, IPC_CHANNELS.SALE_LIST, async (_event, params) => {
    return getSaleRepository().list(params as Record<string, unknown>)
  })

  handle(ipcMain, IPC_CHANNELS.SALE_GET, async (_event, id) => {
    return getSaleRepository().getById(id as number)
  })

  handle(ipcMain, IPC_CHANNELS.SALE_CREATE, async (_event, input) => {
    const parsed = createSalesInvoiceSchema.parse(input)
    return getSaleRepository().create(parsed)
  })

  handle(ipcMain, IPC_CHANNELS.SALE_UPDATE, async (_event, input) => {
    const parsed = updateSalesInvoiceSchema.parse(input)
    return getSaleRepository().update(parsed)
  })

  handle(ipcMain, IPC_CHANNELS.SALE_CONFIRM, (_event, id) => {
    return getSaleService().confirm(id as number)
  })

  handle(ipcMain, IPC_CHANNELS.SALE_CANCEL, (_event, id, reason) => {
    const parsed = cancelSaleSchema.parse({ id, reason })
    return getSaleService().cancel(parsed.id, parsed.reason)
  })

  handle(ipcMain, IPC_CHANNELS.SALE_DELETE, async (_event, id) => {
    return getSaleRepository().deleteDraft(id as number)
  })
}
