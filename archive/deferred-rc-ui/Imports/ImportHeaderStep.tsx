export function ImportHeaderStep(props: {
  value: number
  onChange: (value: number) => void
}): JSX.Element {
  return <label className="text-sm">Dòng tiêu đề (bắt đầu từ 1)
    <input className="form-input mt-1" type="number" min={1} value={props.value + 1}
      onChange={(event) => props.onChange(Math.max(0, Number(event.target.value) - 1))}/>
  </label>
}
