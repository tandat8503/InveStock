import { useEffect, useState } from 'react'
import { appCommands } from '@/lib/commands'
import type { ReportParams, SupplierDebtReportRow } from '@shared/ipc-types'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui'

export function SupplierDebtReport({ initial }: { initial: ReportParams }) {
  const [rows, setRows] = useState<SupplierDebtReportRow[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    void appCommands.reports.supplierDebt(initial).then((result) => {
      setRows(result.data ?? null)
      setError(result.data ? '' : result.error ?? 'Không tải được công nợ nhà cung cấp')
    })
  }, [initial])
  return <div className="space-y-4">
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><strong>Công nợ nhà cung cấp hiện tại</strong><p className="mt-1 text-xs">Đây là số dư công nợ tại thời điểm hiện tại, không phụ thuộc bộ lọc thời gian của các báo cáo khác.</p></div>
    {error ? <ErrorState message={error} /> : !rows ? <LoadingState /> : !rows.length ? <EmptyState message="Hiện không có công nợ nhà cung cấp" /> : <table className="w-full text-sm"><thead><tr>{['Nhà cung cấp','Số HĐ','Tổng mua','Đã trả','Còn nợ','HĐ chưa trả lâu nhất','Thanh toán cuối'].map((label)=><th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{rows.map((row)=><tr key={row.supplierId} className="border-t"><td className="p-2">{row.companyName}</td><td>{row.confirmedInvoiceCount}</td><td>{row.totalPurchased.toLocaleString('vi-VN')}</td><td>{row.totalPaid.toLocaleString('vi-VN')}</td><td>{row.totalDebt.toLocaleString('vi-VN')}</td><td>{row.oldestUnpaidInvoiceDate??'—'}</td><td>{row.lastPaymentDate??'—'}</td></tr>)}</tbody></table>}
  </div>
}
