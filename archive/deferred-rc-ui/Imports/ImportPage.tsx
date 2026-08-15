import { FileSpreadsheet } from 'lucide-react'
import { ImportHistory } from './ImportHistory'
import { ImportWizard } from './ImportWizard'

export function ImportPage(): JSX.Element {
  return <div className="p-6 space-y-5">
    <div className="flex items-center gap-3"><FileSpreadsheet className="text-primary-600"/><div><h1 className="text-2xl font-bold">Import dữ liệu</h1><p className="text-sm text-gray-500">Wizard backend-session: preview, mapping, validation và execute an toàn</p></div></div>
    <ImportWizard/>
    <ImportHistory/>
  </div>
}
