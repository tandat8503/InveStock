import { appCommands } from '@/lib/commands'
import { Button } from '@/components/ui'
import type { ReportExportRequest, ReportParams } from '@shared/ipc-types'
export function ReportExportButton({type,filters}:{type:ReportExportRequest['reportType'];filters:ReportParams}){
 const [saving,setSaving]=useState(false)
 return <Button variant="secondary" isLoading={saving} onClick={()=>void(async()=>{setSaving(true);await appCommands.reports.exportExcel({reportType:type,filters});setSaving(false)})()}>Xuất Excel</Button>
}
import { useState } from 'react'
