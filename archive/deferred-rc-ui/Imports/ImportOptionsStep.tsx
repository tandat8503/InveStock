import type { ImportMode, ImportTransactionMode, ImportType, SupplierDTO } from '@shared/ipc-types'

export interface ImportOptionsState {
  existingProduct: 'error' | 'skip' | 'update_non_financial_fields'
  allowNegativeStock: boolean
  allowNegativeLegacyStock?: boolean
  mode: ImportMode
  transactionMode: ImportTransactionMode
  defaultSupplierId: number
  snapshotDate?: string
}

export function ImportOptionsStep(props: {
  type: ImportType
  value: ImportOptionsState
  suppliers: SupplierDTO[]
  onChange: (value: ImportOptionsState) => void
}): JSX.Element {
  const update = (change: Partial<ImportOptionsState>) => props.onChange({ ...props.value, ...change })
  return <div className="space-y-3">
    {props.type === 'products' && <label className="text-sm block">Sản phẩm đã tồn tại<select className="form-input mt-1" value={props.value.existingProduct} onChange={(event) => update({ existingProduct: event.target.value as ImportOptionsState['existingProduct'] })}><option value="error">Báo lỗi</option><option value="skip">Bỏ qua</option><option value="update_non_financial_fields">Cập nhật trường phi tài chính</option></select></label>}
    {props.type === 'opening_inventory' && <label className="text-sm flex gap-2"><input type="checkbox" checked={props.value.allowNegativeStock} onChange={(event) => update({ allowNegativeStock: event.target.checked })}/>Cho phép tồn âm legacy</label>}
    {props.type === 'nxtgui_inventory_summary' && (
      <div className="space-y-3">
        <label className="text-sm block font-medium">Chế độ Import
          <select
            className="form-input mt-1 block w-full"
            value={props.value.mode === 'initialize_closing_stock' ? 'initialize_closing_stock' : 'reconcile_only'}
            onChange={(event) => update({ mode: event.target.value as ImportMode })}
          >
            <option value="reconcile_only">Chỉ import lấy tên & danh mục sản phẩm (Mã, Tên, ĐVT, Loại vật nuôi) — Không đổi tồn kho</option>
            <option value="initialize_closing_stock">Import danh mục & Khởi tạo tồn kho cuối kỳ (Cập nhật tồn kho & giá vốn)</option>
          </select>
        </label>
        <label className="text-sm block">Ngày Snapshot chốt tồn
          <input
            type="date"
            className="form-input mt-1 block w-full"
            value={props.value.snapshotDate || '2026-06-30'}
            onChange={(event) => update({ snapshotDate: event.target.value })}
          />
        </label>
        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(props.value.allowNegativeLegacyStock)}
            onChange={(event) => update({ allowNegativeLegacyStock: event.target.checked })}
          />
          Cho phép tồn âm legacy (Chỉ cảnh báo, không chặn import)
        </label>
      </div>
    )}
    {(props.type === 'purchase_invoices' || props.type === 'sales_invoices') && <label className="text-sm block">Chế độ<select className="form-input mt-1" value={props.value.mode} onChange={(event) => update({ mode: event.target.value as ImportMode })}><option value="import_as_draft">Tạo nháp (an toàn)</option><option value="import_as_confirmed">Import và xác nhận</option></select></label>}
    {props.type === 'purchase_invoices' && <label className="text-sm block">Nhà cung cấp mặc định<select className="form-input mt-1" value={props.value.defaultSupplierId} onChange={(event) => update({ defaultSupplierId: Number(event.target.value) })}><option value={0}>— Chọn —</option>{props.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.companyName}</option>)}</select></label>}
    {(props.type === 'purchase_invoices' || props.type === 'sales_invoices') && <label className="text-sm block">Transaction<select className="form-input mt-1" value={props.value.transactionMode} onChange={(event) => update({ transactionMode: event.target.value as ImportTransactionMode })}><option value="all_or_nothing">All-or-nothing (mặc định)</option><option value="per_invoice" disabled>Per-invoice (chưa hỗ trợ)</option></select></label>}
    {props.type === 'sales_invoices' && props.value.mode === 'import_as_confirmed' && <p className="text-sm text-amber-700">Giá vốn lịch sử không có trong nguồn sẽ được chốt theo average cost tại thời điểm execute.</p>}
  </div>
}
