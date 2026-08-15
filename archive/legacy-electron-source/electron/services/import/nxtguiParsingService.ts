import * as XLSX from 'xlsx'
import type { AnimalCategory } from '../../../shared/ipc-types'
import type { ImportCell } from './importModels'
import { cellText } from './importParsingService'

export interface NxtguiPeriodInfo {
  periodLabel: string
  periodStart: string
  periodEnd: string
  proposedSnapshotDate: string
}

export function detectNxtguiProfile(
  workbook: XLSX.WorkBook,
  fileName: string
): { isNxtgui: boolean; sheetName: string | null } {
  const targetSheet = workbook.SheetNames.find((name) => name.trim().toUpperCase() === 'TH')
  if (!targetSheet) {
    return { isNxtgui: false, sheetName: null }
  }
  const nameUpper = fileName.toUpperCase()
  const sheetContentUpper = (workbook.Sheets[targetSheet] ? XLSX.utils.sheet_to_txt(workbook.Sheets[targetSheet]) : '').toUpperCase()
  const hasNxtKeywords =
    nameUpper.includes('NXT') ||
    nameUpper.includes('XUẤT') ||
    sheetContentUpper.includes('ĐẦU KỲ') ||
    sheetContentUpper.includes('TỒN CUỐI KỲ') ||
    sheetContentUpper.includes('NHẬP') ||
    sheetContentUpper.includes('XUẤT')

  return {
    isNxtgui: hasNxtKeywords,
    sheetName: targetSheet,
  }
}

export function detectNxtguiPeriod(rows: ImportCell[][], fileName: string): NxtguiPeriodInfo {
  const topText = rows
    .slice(0, 10)
    .flat()
    .map(cellText)
    .join(' ') + ' ' + fileName

  // Quarter regex: Q2/2026, QUÝ 2-2026, QUI 2-2026, 2-2026
  const quarterMatch = topText.match(/(?:QUÝ|QUI|Q)?\s*([1-4])\s*[-/]\s*(\d{4})/i)
  if (quarterMatch) {
    const quarter = Number(quarterMatch[1])
    const year = Number(quarterMatch[2])
    const startMonth = (quarter - 1) * 3 + 1
    const endMonth = quarter * 3
    const startMonthStr = String(startMonth).padStart(2, '0')
    const endMonthStr = String(endMonth).padStart(2, '0')
    const lastDay = new Date(year, endMonth, 0).getDate()

    const periodStart = `${year}-${startMonthStr}-01`
    const periodEnd = `${year}-${endMonthStr}-${String(lastDay).padStart(2, '0')}`

    return {
      periodLabel: `Q${quarter}/${year}`,
      periodStart,
      periodEnd,
      proposedSnapshotDate: periodEnd,
    }
  }

  // Month regex: THÁNG 2-2026, THÁNG 02/2026
  const monthMatch = topText.match(/THÁNG\s*(\d{1,2})\s*[-/]\s*(\d{4})/i)
  if (monthMatch) {
    const month = Number(monthMatch[1])
    const year = Number(monthMatch[2])
    const monthStr = String(month).padStart(2, '0')
    const lastDay = new Date(year, month, 0).getDate()

    const periodStart = `${year}-${monthStr}-01`
    const periodEnd = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

    return {
      periodLabel: `Tháng ${month}/${year}`,
      periodStart,
      periodEnd,
      proposedSnapshotDate: periodEnd,
    }
  }

  // Default fallback for Q2/2026
  return {
    periodLabel: 'Q2/2026',
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    proposedSnapshotDate: '2026-06-30',
  }
}

export function detectNxtguiHeaderRow(rows: ImportCell[][]): number {
  // Pass 1: Look for exact column header row containing STT/MH/TÊN HÀNG/ĐVT
  for (let index = 0; index < Math.min(rows.length, 15); index++) {
    const rowStr = rows[index].map(cellText).join(' ').toUpperCase()
    if (rowStr.includes('BÁO CÁO') || rowStr.includes('CÔNG TY')) continue
    if (
      (rowStr.includes('STT') || rowStr.includes('MH') || rowStr.includes('MÃ HÀNG')) &&
      (rowStr.includes('TÊN HÀNG') || rowStr.includes('TÊN SẢN PHẨM')) &&
      (rowStr.includes('ĐVT') || rowStr.includes('ĐƠN VỊ TÍNH'))
    ) {
      return index
    }
  }
  // Pass 2: Look for section header row
  for (let index = 0; index < Math.min(rows.length, 15); index++) {
    const rowStr = rows[index].map(cellText).join(' ').toUpperCase()
    if (rowStr.includes('BÁO CÁO') || rowStr.includes('CÔNG TY')) continue
    if (
      rowStr.includes('ĐẦU KỲ') ||
      rowStr.includes('CỦA KỲ') ||
      (rowStr.includes('NHẬP') && rowStr.includes('XUẤT') && rowStr.includes('TỒN CUỐI'))
    ) {
      return index
    }
  }
  // Fallback to row 4 (0-indexed 3 or 4)
  return 4
}

export function inferAnimalCategory(productName: string): AnimalCategory {
  const name = productName.toLowerCase()
  if (/heo|lợn|\bheo\b/i.test(name)) return 'heo'
  if (/gà|\bgà\b/i.test(name)) return 'ga'
  if (/vịt|nấm|\bvịt\b/i.test(name)) return 'vit'
  if (/bò|\bbò\b/i.test(name)) return 'bo'
  if (/dê|\bdê\b/i.test(name)) return 'de'
  return 'khac'
}

export function normalizeNxtguiUnit(unitText: string): string {
  const trimmed = unitText.trim()
  const lower = trimmed.toLowerCase()
  if (lower === 'bao') return 'Bao'
  if (lower === 'túi' || lower === 'tui') return 'Túi'
  if (lower === 'bịch' || lower === 'bich') return 'Bịch'
  return trimmed
}

export function isNxtguiProductCode(code: string): boolean {
  return /^HH\d+$/i.test(code.trim())
}
