import * as XLSX from 'xlsx'
import { dialog } from 'electron'
import type { ReportExportRequest, ReportExportResult } from '../../shared/ipc-types'
import { getReportRepository } from '../repositories/reportRepository'

export function createReportWorkbook(request: ReportExportRequest): XLSX.WorkBook {
  const repository = getReportRepository()
  const data = request.reportType === 'import_export' ? repository.inventory(request.filters)
    : request.reportType === 'revenue' ? repository.revenue(request.filters).rows
      : request.reportType === 'product_sales' ? repository.productSales(request.filters)
        : request.reportType === 'supplier_debt' ? repository.supplierDebt(request.filters)
          : repository.priceHistory(request.filters)
  const workbook = XLSX.utils.book_new()
  const summary = XLSX.utils.aoa_to_sheet([
    ['Loại báo cáo', request.reportType],
    ['Từ ngày', request.filters.dateFrom],
    ['Đến ngày', request.filters.dateTo],
    ['Thời gian xuất', new Date().toISOString()],
  ])
  const detail = XLSX.utils.json_to_sheet(data)
  if (detail['!ref']) {
    const range = XLSX.utils.decode_range(detail['!ref'])
    for (let column = range.s.c; column <= range.e.c; column++) {
      const address = XLSX.utils.encode_cell({ r: 0, c: column })
      const cell: unknown = detail[address]
      if (typeof cell === 'object' && cell !== null && 'v' in cell) {
        const headerCell = cell as XLSX.CellObject
        headerCell.s = { font: { bold: true } }
      }
    }
  }
  detail['!autofilter'] = { ref: detail['!ref'] ?? 'A1:A1' }
  detail['!freeze'] = { xSplit: 0, ySplit: 1 }
  detail['!cols'] = Object.keys(data[0] ?? { data: '' }).map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(workbook, summary, 'Tóm tắt')
  XLSX.utils.book_append_sheet(workbook, detail, 'Dữ liệu chi tiết')
  return workbook
}

export async function exportReport(request: ReportExportRequest): Promise<ReportExportResult> {
  const names: Record<ReportExportRequest['reportType'], string> = {
    import_export: 'bao-cao-nhap-xuat-ton', revenue: 'bao-cao-doanh-thu',
    product_sales: 'bao-cao-san-pham-ban-ra', supplier_debt: 'bao-cao-cong-no-ncc',
    price_history: 'lich-su-gia-ban',
  }
  const result = await dialog.showSaveDialog({
    defaultPath: `${names[request.reportType]}_${request.filters.dateFrom}_${request.filters.dateTo}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  })
  if (result.canceled || !result.filePath) return { saved: false, cancelled: true }
  XLSX.writeFile(createReportWorkbook(request), result.filePath)
  return { saved: true, cancelled: false, filePath: result.filePath }
}
