export function ImportExecuteStep(props: {
  executing: boolean
  onExecute: () => void
}): JSX.Element {
  return <div className="space-y-3"><p className="text-sm text-gray-600">Dữ liệu đã sẵn sàng. Không đóng wizard trong khi đang ghi dữ liệu.</p><button disabled={props.executing} className="btn-primary disabled:opacity-50" onClick={props.onExecute}>{props.executing ? 'Đang thực hiện...' : 'Thực hiện import'}</button></div>
}
