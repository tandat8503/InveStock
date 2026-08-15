import type { IpcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { handle } from './utils'
import { getProductRepository } from '../repositories/productRepository'
import {
  createProductSchema,
  updateProductSchema,
  productListParamsSchema,
} from '../../shared/schemas'
import { exportProductsExcel } from '../services/productExportService'

export function registerProductHandlers(ipcMain: IpcMain): void {
  handle(ipcMain, IPC_CHANNELS.PRODUCT_LIST, async (_event, params) => {
    const parsed = productListParamsSchema.parse(params ?? {})
    return getProductRepository().list(parsed)
  })

  handle(ipcMain, IPC_CHANNELS.PRODUCT_GET, async (_event, id) => {
    return getProductRepository().getById(id as number)
  })

  handle(ipcMain, IPC_CHANNELS.PRODUCT_CREATE, async (_event, input) => {
    const parsed = createProductSchema.parse(input)
    return getProductRepository().create(parsed)
  })

  handle(ipcMain, IPC_CHANNELS.PRODUCT_UPDATE, async (_event, input) => {
    const parsed = updateProductSchema.parse(input)
    return getProductRepository().update(parsed)
  })

  handle(ipcMain, IPC_CHANNELS.PRODUCT_TOGGLE_ACTIVE, async (_event, id) => {
    return getProductRepository().toggleActive(id as number)
  })

  handle(ipcMain, IPC_CHANNELS.PRODUCT_DELETE, async (_event, id) => {
    return getProductRepository().safeDelete(id as number)
  })

  handle(ipcMain, IPC_CHANNELS.PRODUCT_HISTORY, async (_event, id, params) => {
    return getProductRepository().getHistory(id as number, params as Record<string, unknown>)
  })

  handle(ipcMain, IPC_CHANNELS.PRODUCT_EXPORT_EXCEL, () => exportProductsExcel())
}
