import type { ReportParams } from '../../shared/ipc-types'
import { getReportRepository } from '../repositories/reportRepository'

export class ReportService {
  inventory(params: ReportParams) { return getReportRepository().inventory(params) }
  revenue(params: ReportParams) { return getReportRepository().revenue(params) }
  productSales(params: ReportParams) { return getReportRepository().productSales(params) }
  supplierDebt(params: ReportParams) { return getReportRepository().supplierDebt(params) }
  priceHistory(params: ReportParams) { return getReportRepository().priceHistory(params) }
  invoiceSearch(params: ReportParams) { return getReportRepository().invoiceSearch(params) }
}

let instance: ReportService | null = null
export function getReportService(): ReportService {
  if (!instance) instance = new ReportService()
  return instance
}
