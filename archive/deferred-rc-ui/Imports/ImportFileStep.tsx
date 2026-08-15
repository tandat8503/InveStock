import { Upload } from 'lucide-react'

export function ImportFileStep(props: {
  fileName?: string
  loading: boolean
  onChoose: () => void
}): JSX.Element {
  return <div className="space-y-3">
    <button disabled={props.loading} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50" onClick={props.onChoose}>
      <Upload size={16}/>{props.loading ? 'Đang đọc file...' : 'Chọn file XLS/XLSX/CSV'}
    </button>
    {props.fileName && <p className="text-sm text-gray-600">Đã chọn: {props.fileName}</p>}
  </div>
}
