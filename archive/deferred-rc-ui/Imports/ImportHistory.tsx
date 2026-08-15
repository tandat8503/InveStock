import { appCommands } from '@/lib/commands'
import { useEffect, useState } from 'react'
import type { ImportJobDTO } from '@shared/ipc-types'

export function ImportHistory(): JSX.Element {
  const [jobs, setJobs] = useState<ImportJobDTO[]>([])
  useEffect(() => { void appCommands.import.history().then((result) => { if (result.success && result.data) setJobs(result.data) }) }, [])
  return <div className="card p-5"><h2 className="font-semibold mb-3">Lịch sử import</h2>
    {!jobs.length ? <p className="text-sm text-gray-500">Chưa có lịch sử import.</p> : <div className="overflow-auto"><table className="min-w-full text-xs"><thead><tr><th className="border p-2">File</th><th className="border p-2">Hash</th><th className="border p-2">Loại/Sheet</th><th className="border p-2">Dòng</th><th className="border p-2">Trạng thái</th><th className="border p-2">Thời gian</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td className="border p-2">{job.sourceFilename}</td><td className="border p-2 font-mono">{job.sourceFileHash.slice(0, 12)}…</td><td className="border p-2">{job.importType}<br/>{job.sheetName}</td><td className="border p-2">{job.importedRows}/{job.totalRows} · W{job.warningRows} · E{job.errorRows}</td><td className="border p-2">{job.status}</td><td className="border p-2">{job.startedAt}<br/>{job.completedAt}</td></tr>)}</tbody></table></div>}
  </div>
}
