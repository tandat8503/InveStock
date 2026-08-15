import type * as XLSX from 'xlsx'
import type {
  ImportValidateRequest,
  ImportValidationResult,
} from '../../../shared/ipc-types'

export type ImportCell = string | number | boolean | Date | null
export type NormalizedImportRow = Record<string, string | number | null>

export interface ImportSession {
  id: string
  filePath: string
  fileName: string
  fileHash: string
  workbook: XLSX.WorkBook
  workbookMetadata: {
    sheetNames: string[]
    fileSize: number
  }
  sheet?: string
  headerRow?: number
  mappings?: ImportValidateRequest['mappings']
  normalizedRows?: NormalizedImportRow[]
  validationResult?: ImportValidationResult
  options?: ImportValidateRequest['options']
  request?: ImportValidateRequest
  createdAt: number
  expiresAt: number
}
