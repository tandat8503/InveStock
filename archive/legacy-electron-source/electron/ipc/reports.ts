import type { IpcMain } from 'electron'
import { handle } from './utils'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { reportExportRequestSchema, reportParamsSchema } from '../../shared/schemas'
import { getReportService } from '../services/reportService'
import { exportReport } from '../services/excelExportService'

export function registerReportHandlers(ipcMain: IpcMain): void {
  handle(ipcMain, IPC_CHANNELS.REPORT_IMPORT_EXPORT, (_event, input) =>
    getReportService().inventory(reportParamsSchema.parse(input)))
  handle(ipcMain, IPC_CHANNELS.REPORT_REVENUE, (_event, input) =>
    getReportService().revenue(reportParamsSchema.parse(input)))
  handle(ipcMain, IPC_CHANNELS.REPORT_SUPPLIER_DEBT, (_event, input) =>
    getReportService().supplierDebt(reportParamsSchema.parse(input)))
  handle(ipcMain, IPC_CHANNELS.REPORT_PRODUCT_SALES, (_event, input) =>
    getReportService().productSales(reportParamsSchema.parse(input)))
  handle(ipcMain, IPC_CHANNELS.REPORT_PRICE_HISTORY, (_event, input) =>
    getReportService().priceHistory(reportParamsSchema.parse(input)))
  handle(ipcMain, IPC_CHANNELS.REPORT_EXPORT_EXCEL, (_event, input) =>
    exportReport(reportExportRequestSchema.parse(input)))
  handle(ipcMain, IPC_CHANNELS.INVOICE_SEARCH, (_event, input) =>
    getReportService().invoiceSearch(reportParamsSchema.parse(input)))
}
