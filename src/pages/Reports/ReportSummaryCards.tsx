import { formatVND } from '@/utils/formatters'
export function ReportSummaryCards({values}:{values:{label:string;value:number;money?:boolean}[]}){
 return <div className="grid gap-3 md:grid-cols-4">{values.map(x=><div key={x.label} className="card p-4"><p className="text-sm text-gray-500">{x.label}</p><p className="text-xl font-bold">{x.money?formatVND(x.value):x.value.toLocaleString('vi-VN')}</p></div>)}</div>
}
