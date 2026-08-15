export interface TransactionMeta {
  label: string
  direction: 'in' | 'out' | 'neutral'
  colorClass: string
  labelColorClass: string
}

export function getInventoryTransactionMeta(type: string): TransactionMeta {
  switch (type) {
    case 'nhap':
    case 'nhap_kho':
    case 'purchase_invoice':
      return {
        label: 'Nhập kho',
        direction: 'in',
        colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
        labelColorClass: 'text-emerald-600 dark:text-emerald-400',
      }
    case 'xuat':
    case 'xuat_kho':
    case 'sales_invoice':
      return {
        label: 'Xuất kho',
        direction: 'out',
        colorClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
        labelColorClass: 'text-blue-600 dark:text-blue-400',
      }
    case 'inventory_adjustment_in':
      return {
        label: 'Điều chỉnh tăng',
        direction: 'in',
        colorClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
        labelColorClass: 'text-amber-600 dark:text-amber-400',
      }
    case 'inventory_adjustment_out':
      return {
        label: 'Điều chỉnh giảm',
        direction: 'out',
        colorClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
        labelColorClass: 'text-amber-600 dark:text-amber-400',
      }
    case 'inventory_adjustment':
    case 'dieu_chinh_kiem_ke':
      return {
        label: 'Điều chỉnh',
        direction: 'neutral',
        colorClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
        labelColorClass: 'text-amber-600 dark:text-amber-400',
      }
    case 'opening_balance':
    case 'legacy_opening':
    case 'nhap_dau_ky':
      return {
        label: 'Số dư khởi tạo',
        direction: 'neutral',
        colorClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800',
        labelColorClass: 'text-indigo-600 dark:text-indigo-400',
      }
    case 'purchase_cancel':
    case 'huy_nhap':
    case 'cancel_purchase':
      return {
        label: 'Hủy nhập',
        direction: 'out',
        colorClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
        labelColorClass: 'text-rose-600 dark:text-rose-400',
      }
    case 'sale_cancel':
    case 'huy_xuat':
    case 'cancel_sale':
      return {
        label: 'Hủy xuất',
        direction: 'in',
        colorClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
        labelColorClass: 'text-rose-600 dark:text-rose-400',
      }
    default:
      return {
        label: type,
        direction: 'neutral',
        colorClass: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-400 dark:border-slate-800',
        labelColorClass: 'text-slate-600 dark:text-slate-400',
      }
  }
}
