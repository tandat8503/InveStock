import type { ImportSheetPreview } from '@shared/ipc-types'

export function ImportSheetStep(props: {
  sheets: ImportSheetPreview[]
  value: string
  onChange: (value: string) => void
}): JSX.Element {
  return <label className="text-sm">Chọn sheet
    <select className="form-input mt-1" value={props.value} onChange={(event) => props.onChange(event.target.value)}>
      {props.sheets.map((sheet) => <option key={sheet.sheetName}>{sheet.sheetName}</option>)}
    </select>
  </label>
}
