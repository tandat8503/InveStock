import type { ImportMapping } from '@shared/ipc-types'

export interface MappingField { key: string; label: string; required?: boolean }

export function ImportMappingStep(props: {
  fields: MappingField[]
  headers: string[]
  mappings: ImportMapping[]
  onChange: (targetField: string, sourceColumn: string) => void
}): JSX.Element {
  return <div className="grid md:grid-cols-2 gap-3">
    {props.fields.map((field) => <label className="text-sm" key={field.key}>{field.label}{field.required ? ' *' : ''}
      <select className="form-input mt-1" value={props.mappings.find((mapping) => mapping.targetField === field.key)?.sourceColumn ?? ''}
        onChange={(event) => props.onChange(field.key, event.target.value)}>
        <option value="">— Không mapping —</option>
        {props.headers.map((header, index) => <option key={`${header}-${index}`} value={header}>{header || `Cột ${index + 1}`}</option>)}
      </select>
    </label>)}
  </div>
}
