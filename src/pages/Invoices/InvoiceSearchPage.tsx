import { appCommands } from '@/lib/commands'
import { localDateISO } from '@/utils/localDate'
import { useState } from 'react'
import { EmptyState, ErrorState, LoadingState, Pagination } from '@/components/ui'
import type { InvoiceSearchRow, PaginatedResult, ReportParams } from '@shared/ipc-types'
import { InvoiceSearchFilters } from './InvoiceSearchFilters'
import { InvoiceSearchTable } from './InvoiceSearchTable'
import { InvoiceDetailModal } from './InvoiceDetailModal'

const today = localDateISO()
export function InvoiceSearchPage() {
  const [filters, setFilters] = useState<ReportParams>({
    dateFrom: `${today.slice(0, 4)}-01-01`,
    dateTo: today,
    invoiceType: 'all',
    page: 1,
    pageSize: 20,
  })
  const [hasQueried, setHasQueried] = useState(false)
  const [data, setData] = useState<PaginatedResult<InvoiceSearchRow> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<InvoiceSearchRow | null>(null)

  const load = async (next = filters) => {
    setLoading(true)
    setHasQueried(true)
    const result = await appCommands.reports.invoiceSearch(next)
    setLoading(false)
    if (result.data) {
      setData(result.data)
      setError('')
    } else {
      setError(result.error ?? 'Không tra cứu được hóa đơn')
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tra cứu hóa đơn</h1>
        <p className="text-xs text-gray-500 mt-0.5">Tìm kiếm hóa đơn nhập kho và xuất kho theo khoảng thời gian</p>
      </div>

      <InvoiceSearchFilters filters={filters} onChange={setFilters} onApply={() => void load()} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !hasQueried ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-500 shadow-sm">
          <p className="text-base font-medium text-gray-700">Nhấn &ldquo;Áp dụng&rdquo; để tra cứu hóa đơn.</p>
          <p className="text-xs text-gray-400 mt-1">Chọn từ ngày, đến ngày hoặc các tiêu chí lọc phía trên rồi nhấn Áp dụng.</p>
        </div>
      ) : !data?.items.length ? (
        <EmptyState message="Không có hóa đơn phù hợp." />
      ) : (
        <InvoiceSearchTable rows={data.items} onOpen={setDetail} />
      )}

      {data && hasQueried && (
        <Pagination
          currentPage={data.page}
          pageSize={data.pageSize}
          totalItems={data.total}
          onPageChange={(page) => {
            const next = { ...filters, page }
            setFilters(next)
            void load(next)
          }}
        />
      )}

      <InvoiceDetailModal row={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

