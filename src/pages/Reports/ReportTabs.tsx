export type ReportTab = 'inventory' | 'revenue' | 'products'
export function ReportTabs({ value, onChange }: { value: ReportTab; onChange: (v: ReportTab) => void }) {
  const tabs: [ReportTab, string][] = [
    ['inventory', 'Nhập – xuất – tồn'],
    ['revenue', 'Giá xuất – Giá vốn'],
    ['products', 'Theo sản phẩm'],
  ]
  return (
    <div className="flex flex-wrap border-b">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          className={`px-4 py-3 text-sm transition-colors ${
            value === id ? 'border-b-2 border-primary-600 font-semibold text-primary-700' : 'text-gray-600 hover:text-gray-900'
          }`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
