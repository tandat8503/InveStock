import type { ImportValidationError, ImportValidationWarning } from '@shared/ipc-types'

export function ImportErrorTable(props: {
  issues: (ImportValidationError | ImportValidationWarning)[]
}): JSX.Element {
  if (!props.issues.length) return <p className="text-sm text-green-700">Không có lỗi.</p>
  return <div className="overflow-auto"><table className="min-w-full text-xs">
    <thead><tr><th className="border p-2">Dòng</th><th className="border p-2">Cột</th><th className="border p-2">Mã</th><th className="border p-2">Nội dung</th></tr></thead>
    <tbody>{props.issues.map((issue, index) => <tr key={`${issue.rowNumber}-${issue.code}-${index}`} className={issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}>
      <td className="border p-2">{issue.rowNumber}</td><td className="border p-2">{issue.column}</td><td className="border p-2">{issue.code}</td><td className="border p-2">{issue.message}</td>
    </tr>)}</tbody>
  </table></div>
}
