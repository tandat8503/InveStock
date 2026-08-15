import type {
  ImportExecuteRequest,
  ImportJobDTO,
  ImportParseResult,
  ImportResult,
  ImportValidateRequest,
  ImportValidationResult,
} from '../../shared/ipc-types'
import { importJobRepository } from '../repositories/importJobRepository'
import { ImportExecutionService } from './import/importExecutionService'
import { exportImportErrorReport } from './import/importErrorReportService'
import { ImportParsingService } from './import/importParsingService'
import { importSessionService } from './import/importSessionService'
import { ImportValidationService } from './import/importValidationService'

export class ImportService {
  private readonly parsing = new ImportParsingService(importSessionService)
  private readonly validation = new ImportValidationService(importSessionService)
  private readonly execution = new ImportExecutionService(importSessionService, importJobRepository)

  parseFile(filePath: string): ImportParseResult {
    return this.parsing.parseFile(filePath)
  }

  validate(request: ImportValidateRequest): ImportValidationResult {
    return this.validation.validate(request)
  }

  execute(request: ImportExecuteRequest): Promise<ImportResult> {
    return this.execution.execute(request)
  }

  cancel(importSessionId: string): boolean {
    return importSessionService.cancel(importSessionId)
  }

  history(limit?: number): ImportJobDTO[] {
    return importJobRepository.list(limit)
  }

  exportErrors(importSessionId: string, filePath: string): string {
    const session = importSessionService.get(importSessionId)
    if (!session.validationResult) throw new Error('Phiên import chưa được validate')
    return exportImportErrorReport(session.validationResult, filePath)
  }
}

export const importService = new ImportService()
