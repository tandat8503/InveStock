import { appCommands } from '@/lib/commands'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Edit2, Trash2, Eye, RefreshCw } from 'lucide-react'
import {
  Button,
  SearchInput,
  Pagination,
  StatusBadge,
  ConfirmDialog,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui'
import { useNotify } from '@/stores/uiStore'
import { formatVND } from '@/utils/formatters'
import type { SupplierDTO, PaginatedResult } from '@shared/ipc-types'
import { SupplierForm } from './SupplierForm'
import { SupplierDetail } from './SupplierDetail'

export function SupplierList() {
  const notify = useNotify()
  const [data, setData] = useState<PaginatedResult<SupplierDTO> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  // Filters
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierDTO | undefined>()
  const [detailSupplierId, setDetailSupplierId] = useState<number | undefined>()
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [toggleActiveSupplier, setToggleActiveSupplier] = useState<SupplierDTO | null>(null)
  const [isToggling, setIsToggling] = useState(false)

  const loadData = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const result = await appCommands.suppliers.list({
        page,
        pageSize,
        search: search || undefined,
      })
      if (seq !== requestSeq.current) return
      if (result.success && result.data) {
        setData(result.data)
      } else {
        setError(result.error ?? 'Lỗi tải danh sách nhà cung cấp')
      }
    } catch (err) {
      if (seq !== requestSeq.current) return
      setError('Lỗi kết nối')
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [page, pageSize, search])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    setPage(1)
  }, [search])

  const handleDelete = async () => {
    if (!deletingId) return
    setIsDeleting(true)
    try {
      const result = await appCommands.suppliers.delete(deletingId)
      if (result.success) {
        notify.success('Xóa nhà cung cấp thành công')
        void loadData()
      } else {
        notify.error(result.error ?? 'Lỗi xóa nhà cung cấp')
      }
    } catch (error) {
      notify.error('Lỗi hệ thống')
    } finally {
      setIsDeleting(false)
      setDeletingId(null)
    }
  }

  const handleToggleActive = async (supplier: SupplierDTO) => {
    if (isToggling) return
    setIsToggling(true)
    try {
      const result = await appCommands.suppliers.toggleActive(supplier.id)
      if (result.success) {
        notify.success('Cập nhật trạng thái thành công')
        setToggleActiveSupplier(null)
        void loadData()
      } else {
        notify.error(result.error ?? 'Lỗi cập nhật trạng thái')
      }
    } catch (error) {
      notify.error('Lỗi hệ thống')
    } finally {
      setIsToggling(false)
    }
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nhà cung cấp</h1>
          <p className="text-sm text-gray-500">Quản lý đối tác cung cấp thức ăn</p>
        </div>
        <Button
          onClick={() => {
            setEditingSupplier(undefined)
            setIsFormOpen(true)
          }}
        >
          <Plus size={16} className="mr-2" />
          Thêm đối tác
        </Button>
      </div>

      <div className="card flex flex-col flex-1 min-h-0">
        {/* Filters */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="w-full md:w-1/3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Tìm theo tên nhà cung cấp, SĐT, địa chỉ..."
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-white">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={() => { void loadData() }} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              message={search ? 'Không tìm thấy nhà cung cấp phù hợp' : 'Chưa có nhà cung cấp nào'}
              action={
                <Button onClick={() => { setEditingSupplier(undefined); setIsFormOpen(true) }}>
                  Thêm đối tác đầu tiên
                </Button>
              }
            />
          ) : (
            <table className="w-full text-sm table-sticky">
              <thead className="bg-white">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Tên nhà cung cấp</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Số điện thoại</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Địa chỉ</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Tổng giá trị nhập</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Trạng thái</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{item.companyName}</td>
                    <td className="px-4 py-3 text-gray-900">{item.phone || '---'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{item.address || '---'}</td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatVND(item.totalPurchased ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge active={item.active} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="text-gray-400 hover:text-blue-600 p-1"
                          onClick={() => setDetailSupplierId(item.id)}
                          title="Xem chi tiết"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          className="text-gray-400 hover:text-warning-600 p-1"
                          onClick={() => { setToggleActiveSupplier(item) }}
                          title={item.active ? 'Ngừng hợp tác' : 'Hợp tác lại'}
                        >
                          <RefreshCw size={18} />
                        </button>
                        <button
                          className="text-gray-400 hover:text-primary-600 p-1"
                          onClick={() => {
                            setEditingSupplier(item)
                            setIsFormOpen(true)
                          }}
                          title="Sửa"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          className="text-gray-400 hover:text-danger-600 p-1"
                          onClick={() => setDeletingId(item.id)}
                          title="Xóa"
                        >
                          <Trash2 size={18} />
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
          <div className="flex-shrink-0">
            <Pagination
              currentPage={data.page}
              pageSize={data.pageSize}
              totalItems={data.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {isFormOpen && (
        <SupplierForm
          supplier={editingSupplier}
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSuccess={() => {
            setIsFormOpen(false)
            void loadData()
          }}
        />
      )}

      {detailSupplierId && (
        <SupplierDetail
          supplierId={detailSupplierId}
          isOpen={!!detailSupplierId}
          onClose={() => setDetailSupplierId(undefined)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deletingId}
        title="Xóa nhà cung cấp"
        message={
          <>
            Bạn có chắc chắn muốn xóa nhà cung cấp này? Thao tác này không thể hoàn tác.<br /><br />
            <span className="text-warning-600 font-medium">Lưu ý: Nếu nhà cung cấp đã có hóa đơn nhập kho, hệ thống sẽ không cho phép xóa cứng.</span>
          </>
        }
        onConfirm={() => { void handleDelete() }}
        onCancel={() => setDeletingId(null)}
        isLoading={isDeleting}
      />

      <ConfirmDialog
        isOpen={toggleActiveSupplier !== null}
        title={toggleActiveSupplier?.active ? "Ngừng hoạt động nhà cung cấp?" : "Kích hoạt lại nhà cung cấp?"}
        message={
          toggleActiveSupplier?.active
            ? `Hành động này sẽ tạm ngừng hoạt động nhà cung cấp "${toggleActiveSupplier.companyName}". Bạn sẽ không thể tạo phiếu nhập mới cho nhà cung cấp này.`
            : `Hành động này sẽ kích hoạt lại nhà cung cấp "${toggleActiveSupplier?.companyName}".`
        }
        confirmText="Xác nhận"
        cancelText="Quay lại"
        type="warning"
        isLoading={isToggling}
        onConfirm={() => {
          if (toggleActiveSupplier) void handleToggleActive(toggleActiveSupplier)
        }}
        onCancel={() => setToggleActiveSupplier(null)}
      />
    </div>
  )
}
