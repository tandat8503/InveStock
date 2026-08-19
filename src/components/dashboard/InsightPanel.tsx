import { Lightbulb, Info } from 'lucide-react'

export interface InsightPanelProps {
  insights: string[]
}

export function InsightPanel({ insights }: InsightPanelProps) {
  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1 rounded-md bg-sky-500 text-white">
          <Lightbulb size={15} />
        </div>
        <h2 className="text-sm font-bold text-sky-900">Nhận định & Cảnh báo nhanh</h2>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
        {insights.map((text, idx) => (
          <div key={idx} className="flex items-start gap-2 rounded-lg border border-white bg-white/90 p-2.5 shadow-sm text-xs text-slate-700">
            <Info size={14} className="mt-0.5 flex-shrink-0 text-sky-500" />
            <span className="leading-relaxed">{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
