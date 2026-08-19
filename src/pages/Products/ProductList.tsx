import { appCommands } from '@/lib/commands'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Edit2, Trash2, Eye, RefreshCw } from 'lucide-react'
import {
  Button,
  SearchInput,
  Select,
  Pagination,
  StatusBadge,
  ConfirmDialog,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui'
import { useNotify } from '@/stores/uiStore'
import { formatNumber, formatWeight, animalCategoryLabels } from '@/utils/formatters'
import type { ProductDTO, PaginatedResult, AnimalCategory, InventoryUnit } from '@shared/ipc-types'
import { ProductForm } from './ProductForm'
import { ProductDetail } from './ProductDetail'

export function ProductList() {
  const notify = useNotify()
  const [data, setData] = useState<PaginatedResult<ProductDTO> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [animalCategory, setAnimalCategory] = useState<AnimalCategory | ''>('')
  const [inventoryUnit, setInventoryUnit] = useState<InventoryUnit | ''>('')
  const [activeOnly, setActiveOnly] = useState('true')
  const [lowStockThreshold, setLowStockThreshold] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductDTO | undefined>()
  const [detailProduct, setDetailProduct] = useState<ProductDTO | undefined>()
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [togglingProduct, setTogglingProduct] = useState<ProductDTO | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [togglingProductId, setTogglingProductId] = useState<number | null>(null)
  const requestIdRef = useRef(0)

  const loadData = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await appCommands.products.list({
        page,
        pageSize,
        search: search || undefined,
        animalCategory: animalCategory || undefined,
        inventoryUnit: inventoryUnit || undefined,
        activeOnly: activeOnly === 'true' ? true : activeOnly === 'false' ? false : undefined,
      })
      if (requestId !== requestIdRef.current) return
      if (result.success && result.data) {
        if (result.data.items.length === 0 && result.data.total > 0 && page > 1) {
          const maxPage = Math.ceil(result.data.total / pageSize)
          setPage(maxPage)
          return
        }
        setData(result.data)
      } else {
        setError(result.error ?? 'Lỗi tải danh sách sản phẩm')
      }
    } catch {
      if (requestId !== requestIdRef.current) return
      setError('Lỗi kết nối')
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [page, pageSize, search, animalCategory, inventoryUnit, activeOnly])

  useEffect(() => { void loadData() }, [loadData])
  useEffect(() => {
    void appCommands.settings.get().then((result) => {
      if (result.data) setLowStockThreshold(result.data.lowStockThreshold)
    })
  }, [])

  const handleDelete = async () => {
    if (!deletingId) return
    setIsDeleting(true)
    try {
      const result = await appCommands.products.delete(deletingId)
      if (result.success) {
        notify.success('Xóa sản phẩm thành công')
        void loadData()
      } else {
        notify.error(result.error ?? 'Lỗi xóa sản phẩm')
      }
    } catch {
      notify.error('Lỗi hệ thống')
    } finally {
      setIsDeleting(false)
      setDeletingId(null)
    }
  }

  const handleToggleActive = async (id: number) => {
    if (togglingProductId !== null) return
    setTogglingProductId(id)
    try {
      const result = await appCommands.products.toggleActive(id)
      if (result.success) {
        notify.success('Cập nhật trạng thái thành công')
        await loadData()
        setTogglingProduct(null)
      } else {
        notify.error(result.error ?? 'Lỗi cập nhật trạng thái')
      }
    } catch {
      notify.error('Lỗi hệ thống')
    } finally {
      setTogglingProductId(null)
    }
  }

  const hasActiveFilters = search.trim() !== '' || animalCategory !== '' || inventoryUnit !== '' || activeOnly !== 'all'

  return (
    <div className="flex h-full flex-col p-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Sản phẩm</h1>
          <p className="page-subtitle">Quản lý danh mục thức ăn chăn nuôi</p>
        </div>
        <Button
          onClick={() => {
            setEditingProduct(undefined)
            setIsFormOpen(true)
          }}
        >
          <Plus size={16} />
          Thêm sản phẩm
        </Button>
      </div>

      {/* Card container */}
      <div className="card flex flex-col flex-1 min-h-0">
        {/* Filters */}
        <div className="flex-shrink-0 p-4 border-b border-slate-200 bg-slate-50/60">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <SearchInput
              value={search}
              onChange={(value) => { setSearch(value); setPage(1) }}
              placeholder="Tìm theo mã, tên..."
            />
            <Select
              options={[
                { value: '', label: 'Tất cả vật nuôi' },
                { value: 'heo', label: 'Heo' },
                { value: 'ga', label: 'Gà' },
                { value: 'vit', label: 'Vịt' },
                { value: 'bo', label: 'Bò' },
                { value: 'de', label: 'Dê' },
                { value: 'khac', label: 'Khác' },
              ]}
              value={animalCategory}
              onChange={(e) => { setAnimalCategory(e.target.value as AnimalCategory | ''); setPage(1) }}
            />
            <Select
              options={[
                { value: '', label: 'Tất cả quy cách' },
                { value: 'Bao', label: 'Bao' },
                { value: 'Tui', label: 'Túi' },
                { value: 'Bich', label: 'Bịch' },
              ]}
              value={inventoryUnit}
              onChange={(e) => { setInventoryUnit(e.target.value as InventoryUnit | ''); setPage(1) }}
            />
            <Select
              options={[
                { value: 'all', label: 'Tất cả trạng thái' },
                { value: 'true', label: 'Đang kinh doanh' },
                { value: 'false', label: 'Ngừng kinh doanh' },
              ]}
              value={activeOnly}
              onChange={(e) => { setActiveOnly(e.target.value); setPage(1) }}
            />
          </div>
        </div>

        {/* Table area */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={() => { void loadData() }} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              title={hasActiveFilters ? 'Không tìm thấy sản phẩm phù hợp' : 'Chưa có sản phẩm nào'}
              message={hasActiveFilters ? 'Thử điều chỉnh bộ lọc để tìm kết quả phù hợp.' : 'Bắt đầu bằng cách thêm sản phẩm đầu tiên.'}
              action={
                <Button onClick={() => { setEditingProduct(undefined); setIsFormOpen(true) }}>
                  <Plus size={16} />
                  {hasActiveFilters ? 'Thêm sản phẩm mới' : 'Thêm sản phẩm đầu tiên'}
                </Button>
              }
            />
          ) : (
            <table className="table table-sticky w-full">
              <thead>
                <tr>
                  <th className="w-28">Mã SP</th>
                  <th>Tên sản phẩm</th>
                  <th>Vật nuôi</th>
                  <th>Quy cách</th>
                  <th className="text-right">Tồn kho</th>
                  <th className="text-center">Trạng thái</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono text-slate-600 text-xs">{item.productCode}</td>
                    <td className="font-medium text-slate-900">{item.productName}</td>
                    <td className="text-slate-500">{animalCategoryLabels[item.animalCategory] ?? item.animalCategory}</td>
                    <td className="text-slate-500">
                      {item.packageWeightKnown ? formatWeight(item.packageWeightGrams, item.packageWeightUnit) : 'Chưa thiết lập'} / {item.inventoryUnit}
                    </td>
                    <td className="text-right">
                      <span className={`font-semibold ${item.currentStock <= 0 ? 'text-red-600' : lowStockThreshold !== null && item.currentStock <= lowStockThreshold ? 'text-amber-600' : 'text-slate-900'}`}>
                        {formatNumber(item.currentStock)} {item.inventoryUnit}
                      </span>
                      {item.currentStock < 0 ? (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">Tồn âm</span>
                      ) : item.currentStock === 0 ? (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">Hết</span>
                      ) : lowStockThreshold !== null && item.currentStock <= lowStockThreshold ? (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Sắp hết (≤{lowStockThreshold})</span>
                      ) : null}
                    </td>
                    <td className="text-center">
                      <StatusBadge active={item.active} />
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600"
                          onClick={() => setDetailProduct(item)}
                          title="Xem chi tiết"
                        >
                          <Eye size={17} />
                        </button>
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600 disabled:opacity-40"
                          disabled={togglingProductId !== null}
                          onClick={() => setTogglingProduct(item)}
                          title={item.active ? 'Ngừng kinh doanh' : 'Mở kinh doanh lại'}
                        >
                          <RefreshCw size={17} />
                        </button>
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-primary-600"
                          onClick={() => {
                            setEditingProduct(item)
                            setIsFormOpen(true)
                          }}
                          title="Sửa"
                        >
                          <Edit2 size={17} />
                        </button>
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          onClick={() => setDeletingId(item.id)}
                          title="Xóa"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && !error && data && data.total > 0 && (
          <Pagination
            currentPage={data.page}
            pageSize={data.pageSize}
            totalItems={data.total}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* Forms and Modals */}
      {isFormOpen && (
        <ProductForm
          product={editingProduct}
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSuccess={() => {
            setIsFormOpen(false)
            void loadData()
          }}
        />
      )}

      {detailProduct && (
        <ProductDetail
          product={detailProduct}
          isOpen={!!detailProduct}
          onClose={() => setDetailProduct(undefined)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deletingId}
        title="Xóa sản phẩm"
        message={
          <>
            Bạn có chắc chắn muốn xóa sản phẩm này? Thao tác này không thể hoàn tác.<br /><br />
            <span className="text-amber-600 font-medium">Lưu ý: Nếu sản phẩm đã có giao dịch nhập/xuất, hệ thống sẽ không cho phép xóa. Thay vào đó hãy dùng nút "Ngừng kinh doanh".</span>
          </>
        }
        onConfirm={() => { void handleDelete() }}
        onCancel={() => setDeletingId(null)}
        isLoading={isDeleting}
      />

      <ConfirmDialog
        isOpen={!!togglingProduct}
        title={togglingProduct?.active ? 'Ngừng hoạt động sản phẩm?' : 'Kích hoạt lại sản phẩm?'}
        message={togglingProduct?.active
          ? 'Ngừng hoạt động sản phẩm này? Sản phẩm sẽ không còn được chọn cho giao dịch mới nhưng lịch sử vẫn được giữ nguyên.'
          : 'Sản phẩm sẽ xuất hiện trở lại trong các phiếu mới.'}
        confirmText={togglingProduct?.active ? 'Ngừng hoạt động' : 'Kích hoạt'}
        type={togglingProduct?.active ? 'warning' : 'info'}
        isLoading={togglingProductId !== null}
        onConfirm={() => {
          if (togglingProduct) void handleToggleActive(togglingProduct.id)
        }}
        onCancel={() => { if (togglingProductId === null) setTogglingProduct(null) }}
      />
    </div>
  )
}
