import type { ImportType } from '@shared/ipc-types'

export function ImportTypeStep(props: {
  value: ImportType
  onChange: (value: ImportType) => void
}): JSX.Element {
  return <label className="text-sm">Loại dữ liệu
    <select className="form-input mt-1" value={props.value} onChange={(event) => props.onChange(event.target.value as ImportType)}>
      <option value="products">Danh mục sản phẩm</option>
      <option value="opening_inventory">Tồn đầu kỳ</option>
      <option value="purchase_invoices">Hóa đơn nhập</option>
      <option value="sales_invoices">Hóa đơn bán</option>
      <option value="nxtgui_inventory_summary">Bảng tổng hợp xuất - nhập - tồn (NXTGUI)</option>
    </select>
  </label>
}
