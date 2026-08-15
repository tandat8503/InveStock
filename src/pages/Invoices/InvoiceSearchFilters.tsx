import { Button, SearchInput, Select, DatePicker } from '@/components/ui'
import type { InvoiceStatus, ReportParams } from '@shared/ipc-types'

export function InvoiceSearchFilters({
  filters,
  onChange,
  onApply,
}: {
  filters: ReportParams
  onChange: (value: ReportParams) => void
  onApply: () => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
      <div className="flex-1 min-w-[200px]">
        <SearchInput
          value={filters.search ?? ''}
          onChange={(search) => onChange({ ...filters, search, page: 1 })}
          placeholder="Số HĐ, mã phiếu, đối tác, sản phẩm..."
        />
      </div>

      <div className="w-36">
        <Select
          label="Loại phiếu"
          value={filters.invoiceType ?? 'all'}
          onChange={(e) => onChange({ ...filters, invoiceType: e.target.value as ReportParams['invoiceType'], page: 1 })}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'purchase', label: 'Nhập kho' },
            { value: 'sale', label: 'Xuất kho' },
          ]}
        />
      </div>

      <div className="w-40">
        <Select
          label="Trạng thái"
          value={filters.status ?? ''}
          onChange={(e) => onChange({ ...filters, status: (e.target.value || undefined) as InvoiceStatus | undefined, page: 1 })}
          options={[
            { value: '', label: 'Mọi trạng thái' },
            { value: 'nhap', label: 'Nháp' },
            { value: 'xac_nhan', label: 'Đã xác nhận' },
            { value: 'huy', label: 'Đã hủy' },
          ]}
        />
      </div>

      <div className="w-44">
        <Select
          label="Sắp xếp"
          value={filters.sortBy ?? 'newest'}
          onChange={(e) => onChange({ ...filters, sortBy: e.target.value, page: 1 })}
          options={[
            { value: 'newest', label: 'Mới nhất' },
            { value: 'oldest', label: 'Cũ nhất' },
            { value: 'value_desc', label: 'Giá trị cao → thấp' },
            { value: 'value_asc', label: 'Giá trị thấp → cao' },
          ]}
        />
      </div>

      <div className="w-36">
        <DatePicker
          label="Từ ngày"
          value={filters.dateFrom || ''}
          onChange={(dateFrom) => onChange({ ...filters, dateFrom, page: 1 })}
        />
      </div>

      <div className="w-36">
        <DatePicker
          label="Đến ngày"
          value={filters.dateTo || ''}
          onChange={(dateTo) => onChange({ ...filters, dateTo, page: 1 })}
        />
      </div>

      <Button onClick={onApply} className="h-9">
        Áp dụng
      </Button>
    </div>
  )
}

