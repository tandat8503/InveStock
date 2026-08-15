import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { getSqlite } from '../../db/connection'
import { sha256File } from '../../utils/fileSafety'
import type { ImportParseResult } from '../../../shared/ipc-types'
import type { ImportCell } from './importModels'
import { importSessionService, type ImportSessionService } from './importSessionService'
import { detectNxtguiHeaderRow, detectNxtguiPeriod, detectNxtguiProfile } from './nxtguiParsingService'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const SUPPORTED_EXTENSIONS = new Set(['.xls', '.xlsx', '.csv'])
const HEADER_ALIASES = [
  'mh', 'mã hàng', 'mã sản phẩm', 'product code', 'tên hàng', 'tên sản phẩm',
  'đvt', 'đơn vị tính', 'sl', 'số lượng', 'đg', 'đơn giá', 'tt', 'thành tiền',
  'số hđ', 'số hóa đơn', 'ngày tháng', 'ngày', 'ngày hóa đơn',
]

export function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function normalizedHeader(value: unknown): string {
  return cellText(value).toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ')
}

export function detectImportHeader(rows: ImportCell[][]): number {
  let bestRow = 0
  let bestScore = -1
  rows.slice(0, 20).forEach((row, index) => {
    const score = row.reduce<number>(
      (sum, cell) => sum + (HEADER_ALIASES.includes(normalizedHeader(cell)) ? 1 : 0),
      0
    )
    if (score > bestScore) {
      bestScore = score
      bestRow = index
    }
  })
  return bestRow
}

export function readImportSheet(workbook: XLSX.WorkBook, sheetName: string): ImportCell[][] {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error('Sheet không tồn tại')
  return XLSX.utils.sheet_to_json<ImportCell[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  })
}

export class ImportParsingService {
  constructor(private readonly sessions: ImportSessionService = importSessionService) {}

  parseFile(filePath: string): ImportParseResult {
    const extension = path.extname(filePath).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error('Chỉ hỗ trợ XLS, XLSX và CSV')
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size > MAX_FILE_SIZE) {
      throw new Error('File không hợp lệ hoặc vượt quá 50 MB')
    }
    const workbook = XLSX.readFile(filePath, {
      cellDates: true,
      dense: false,
      bookVBA: false,
      raw: extension === '.csv',
    })
    const fileHash = sha256File(filePath)
    const duplicateFile = Boolean(getSqlite().prepare(
      "SELECT 1 FROM import_jobs WHERE source_file_hash = ? AND status = 'success' LIMIT 1"
    ).get(fileHash))
    const id = crypto.randomUUID()
    const fileName = path.basename(filePath)
    const nxtProfile = detectNxtguiProfile(workbook, fileName)

    const sheets = workbook.SheetNames.map((sheetName) => {
      const rows = readImportSheet(workbook, sheetName)
      const isNxtSheet = nxtProfile.isNxtgui && (sheetName.trim().toUpperCase() === 'TH' || nxtProfile.sheetName === sheetName)
      const detectedHeaderRow = isNxtSheet ? detectNxtguiHeaderRow(rows) : detectImportHeader(rows)
      const periodInfo = isNxtSheet ? detectNxtguiPeriod(rows, fileName) : null

      return {
        sheetName,
        headers: (rows[detectedHeaderRow] ?? []).map(cellText),
        rows: rows.slice(0, 50).map((row) => row.map((cell) =>
          cell instanceof Date ? cell.toISOString() :
            typeof cell === 'boolean' ? String(cell) : cell
        )),
        totalRows: rows.length,
        columnCount: Math.max(0, ...rows.map((row) => row.length)),
        detectedHeaderRow,
        detectedProfile: isNxtSheet ? ('nxtgui' as const) : ('generic' as const),
        proposedPeriodLabel: periodInfo?.periodLabel,
        proposedPeriodStart: periodInfo?.periodStart,
        proposedPeriodEnd: periodInfo?.periodEnd,
        proposedSnapshotDate: periodInfo?.proposedSnapshotDate,
        warnings: duplicateFile
          ? ['File có hash trùng với lần import thành công trước']
          : [],
      }
    })
    this.sessions.create({
      id,
      filePath,
      fileName,
      fileHash,
      workbook,
      workbookMetadata: { sheetNames: workbook.SheetNames, fileSize: stat.size },
    })
    return {
      importSessionId: id,
      fileName,
      fileHash,
      duplicateFile,
      sheets,
    }
  }
}
