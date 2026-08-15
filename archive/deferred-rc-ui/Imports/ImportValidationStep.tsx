import type { ImportValidationResult } from '@shared/ipc-types'
import { ImportErrorTable } from './ImportErrorTable'

export function ImportValidationStep(props: {
  validation: ImportValidationResult
  onExportErrors: () => void
}): JSX.Element {
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-4 text-sm"><span>Tổng: {props.validation.totalRows}</span><span className="text-green-700">Hợp lệ: {props.validation.validRows}</span><span className="text-red-700">Lỗi: {props.validation.errorRows}</span><span className="text-amber-700">Cảnh báo: {props.validation.warningRows}</span></div>
    <ImportErrorTable issues={[...props.validation.errors, ...props.validation.warnings]}/>
    {!!(props.validation.errors.length || props.validation.warnings.length) && <button className="px-3 py-2 border rounded text-sm" onClick={props.onExportErrors}>Xuất danh sách lỗi</button>}
  </div>
}
