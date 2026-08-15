import type { IpcMain } from 'electron'
import { handle } from './utils'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { getInventoryRepository } from '../repositories/inventoryRepository'

export function registerInventoryHandlers(ipcMain: IpcMain): void {
  handle(ipcMain, IPC_CHANNELS.INVENTORY_SUMMARY, async (_event, params) => {
    return getInventoryRepository().getSummary(params as Record<string, unknown>)
  })

  handle(ipcMain, IPC_CHANNELS.INVENTORY_TRANSACTIONS, async (_event, params) => {
    return getInventoryRepository().getTransactions(params as Record<string, unknown>)
  })

  handle(ipcMain, IPC_CHANNELS.INVENTORY_PRODUCT_HISTORY, async (_event, productId, params) => {
    return getInventoryRepository().getProductHistory(
      productId as number,
      params as Record<string, unknown>
    )
  })
}
