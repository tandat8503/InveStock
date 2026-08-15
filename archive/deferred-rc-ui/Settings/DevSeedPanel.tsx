import { useState, useEffect } from 'react'
import { Database, DatabaseBackup, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { useNotify } from '@/stores/uiStore'
import type { DatabaseStatsDTO } from '@shared/ipc-types'

// Chỉ hiển thị trong môi trường development
const IS_DEV = import.meta.env.DEV

export function DevSeedPanel() {
  if (!IS_DEV) return null
  const notify = useNotify()
  const [stats, setStats] = useState<DatabaseStatsDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [clearExisting, setClearExisting] = useState(true)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    void loadStats()
  }, [])

  const loadStats = async () => {
    setLoading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (window as any).electronAPI.seed.getDbStats()
      if (res.success && res.data) {
        setStats(res.data)
      }
    } catch {
      notify.error('Lỗi khi tải thông tin database')
    } finally {
      setLoading(false)
    }
  }

  const handleRunSeed = async () => {
    setSeeding(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (window as any).electronAPI.seed.seedDemoData(clearExisting)
      if (res.success && res.data) {
        notify.success(res.data.message || 'Gieo dữ liệu thành công!')
        setIsModalOpen(false)
        void loadStats()
      } else {
        notify.error(res.error || 'Lỗi gieo dữ liệu')
      }
    } catch {
      notify.error('Lỗi hệ thống khi gieo dữ liệu')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="card p-6 border-amber-200 bg-amber-50/40">
      <div className="flex items-center justify-between border-b border-amber-200/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-500 text-white">
            <Database size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Developer Seed Data (Môi trường Test)</h3>
            <p className="text-xs text-gray-500">Khởi tạo dữ liệu thử nghiệm chuẩn cho 17+ hạng mục kiểm thử ứng dụng</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void loadStats()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </Button>
      </div>

      <div className="mt-4">
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs mb-4">
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <span className="text-gray-500">Sản phẩm:</span>
              <p className="text-lg font-bold text-gray-900">{stats.productCount}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <span className="text-gray-500">Nhà cung cấp:</span>
              <p className="text-lg font-bold text-gray-900">{stats.supplierCount}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <span className="text-gray-500">Phiếu nhập:</span>
              <p className="text-lg font-bold text-gray-900">{stats.purchaseCount}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <span className="text-gray-500">Hóa đơn bán:</span>
              <p className="text-lg font-bold text-gray-900">{stats.salesCount}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <span className="text-gray-500">Lịch sử kho:</span>
              <p className="text-lg font-bold text-gray-900">{stats.transactionCount}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-amber-200">
          <div className="text-xs text-amber-800 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-600" />
              Cảnh báo an toàn dữ liệu:
            </p>
            <p>• Dữ liệu seed sẽ mô phỏng đầy đủ danh mục, tồn kho, giá vốn bình quân, công nợ và biểu đồ 6 tháng.</p>
            <p>• Tất cả thao tác được thực hiện trong SQLite Transaction an toàn.</p>
          </div>

          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white border-none flex-shrink-0 ml-4"
          >
            <DatabaseBackup size={16} />
            Khởi tạo Dữ liệu Test
          </Button>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Xác nhận gieo dữ liệu thử nghiệm"
        size="md"
        footer={
          <>
            <Button
              onClick={() => void handleRunSeed()}
              isLoading={seeding}
              className="bg-amber-600 hover:bg-amber-700 text-white border-none"
            >
              Đồng ý Khởi tạo
            </Button>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={seeding}>
              Hủy bỏ
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-gray-700">
          {stats && !stats.isEmpty && (
            <div className="p-3 bg-amber-100/70 border border-amber-300 rounded-lg text-amber-900 text-xs">
              <p className="font-bold flex items-center gap-1">
                <AlertTriangle size={14} /> Database hiện tại KHÔNG RỖNG!
              </p>
              <p className="mt-1">
                Đang có {stats.productCount} sản phẩm, {stats.supplierCount} NCC, {stats.purchaseCount} phiếu nhập, {stats.salesCount} hóa đơn bán.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-800">
              <input
                type="checkbox"
                checked={clearExisting}
                onChange={(e) => setClearExisting(e.target.checked)}
                className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              />
              Xóa sạch dữ liệu test hiện tại trước khi tạo mới (Khuyên dùng)
            </label>
          </div>

          <div className="bg-gray-50 p-3 rounded-lg text-xs space-y-1 text-gray-600">
            <p className="font-semibold text-gray-800">Các hạng mục sẽ được sinh tự động:</p>
            <p className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-600" /> 12 Sản phẩm (có SP hết hàng demo)</p>
            <p className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-600" /> 5 Nhà cung cấp lớn</p>
            <p className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-600" /> 6 Phiếu nhập hàng 6 tháng gần nhất (có phí VC)</p>
            <p className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-600" /> 6 Hóa đơn xuất kho (snapshot giá vốn + lợi nhuận)</p>
            <p className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-600" /> Biến động tồn kho, Moving Average Cost & biểu đồ</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
