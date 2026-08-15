import type { IpcMain } from 'electron'
import { handle } from './utils'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import {
  createPurchaseInvoiceSchema,
  updatePurchaseInvoiceSchema,
} from '../../shared/schemas'
import { getPurchaseRepository } from '../repositories/purchaseRepository'
import { getPurchaseService } from '../services/purchaseService'

export function registerPurchaseHandlers(ipcMain: IpcMain): void {
  handle(ipcMain, IPC_CHANNELS.PURCHASE_LIST, async (_event, params) => {
    return getPurchaseRepository().list(params as Record<string, unknown>)
  })

  handle(ipcMain, IPC_CHANNELS.PURCHASE_GET, async (_event, id) => {
    return getPurchaseRepository().getById(id as number)
  })

  handle(ipcMain, IPC_CHANNELS.PURCHASE_CREATE, async (_event, input) => {
    const parsed = createPurchaseInvoiceSchema.parse(input)
    return getPurchaseRepository().create(parsed)
  })

  handle(ipcMain, IPC_CHANNELS.PURCHASE_UPDATE, async (_event, input) => {
    const parsed = updatePurchaseInvoiceSchema.parse(input)
    return getPurchaseRepository().update(parsed)
  })

  handle(ipcMain, IPC_CHANNELS.PURCHASE_CONFIRM, async (_event, id) => {
    return getPurchaseService().confirm(id as number)
  })

  handle(ipcMain, IPC_CHANNELS.PURCHASE_CANCEL, async (_event, id, reason) => {
    return getPurchaseService().cancel(id as number, reason as string | undefined)
  })

  handle(ipcMain, IPC_CHANNELS.PURCHASE_DELETE, async (_event, id) => {
    return getPurchaseRepository().deleteDraft(id as number)
  })

  handle(ipcMain, IPC_CHANNELS.PURCHASE_CHECK_DUPLICATE, async (_event, supplierId, invoiceNumber, excludeId) => {
    return getPurchaseRepository().checkDuplicateInvoiceNumber(
      supplierId as number,
      invoiceNumber as string,
      excludeId as number | undefined
    )
  })

  handle(ipcMain, IPC_CHANNELS.PAYMENT_CREATE, async (_event, input) => {
    const { createSupplierPaymentSchema } = await import('../../shared/schemas')
    const parsed = createSupplierPaymentSchema.parse(input)
    return getPurchaseRepository().createPayment(parsed)
  })

  handle(ipcMain, IPC_CHANNELS.PAYMENT_LIST, async (_event, purchaseInvoiceId) => {
    return getPurchaseRepository().getPayments(purchaseInvoiceId as number)
  })
}
