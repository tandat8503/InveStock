export function ImportPreviewStep(props: {
  headers: string[]
  rows: (string | number | null)[][]
  title: string
}): JSX.Element {
  if (!props.rows.length) return <p className="text-sm text-gray-500">Không có dữ liệu xem trước.</p>
  return <div className="overflow-auto"><h3 className="font-medium mb-2">{props.title}</h3>
    <table className="min-w-full text-xs"><thead><tr>{props.headers.map((header, index) => <th className="border p-2 text-left" key={`${header}-${index}`}>{header || `Cột ${index + 1}`}</th>)}</tr></thead>
      <tbody>{props.rows.slice(0, 20).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td className="border p-2 whitespace-nowrap" key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
    </table>
  </div>
}
