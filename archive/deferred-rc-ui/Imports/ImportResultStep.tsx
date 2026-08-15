import type { ImportResult } from '@shared/ipc-types'

export function ImportResultStep(props: { result: ImportResult }): JSX.Element {
  return <div className="rounded bg-green-50 text-green-800 p-4">
    <p className="font-medium">Import thành công</p>
    <p className="text-sm">Đã import {props.result.importedCount} dòng, bỏ qua {props.result.skippedCount} dòng. Audit job #{props.result.importJobId}.</p>
  </div>
}
