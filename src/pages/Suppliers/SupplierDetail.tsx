import { appCommands } from '@/lib/commands'
import { useEffect, useState } from 'react'
import { Modal, StatusBadge, LoadingState, ErrorState, EmptyState } from '@/components/ui'
import { formatVND, formatDate } from '@/utils/formatters'
import type { SupplierDTO, SupplierStatsDTO, PurchaseInvoiceDTO } from '@shared/ipc-types'
import { Building2, FileText, CheckSquare } from 'lucide-react'

export interface SupplierDetailProps {
  supplierId: number
  isOpen: boolean
  onClose: () => void
}

export function SupplierDetail({ supplierId, isOpen, onClose }: SupplierDetailProps) {
  const [supplier, setSupplier] = useState<SupplierDTO | null>(null)
  const [stats, setStats] = useState<SupplierStatsDTO | null>(null)
  const [invoices, setInvoices] = useState<PurchaseInvoiceDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    
    let isMounted = true
    const fetchData = async () => {
      setLoading(true)
      try {
        const [supplierRes, statsRes, invoicesRes] = await Promise.all([
          appCommands.suppliers.get(supplierId),
          appCommands.suppliers.stats(supplierId),
          appCommands.purchases.list({ supplierId, page: 1, pageSize: 50 }),
        ])
        
        if (isMounted) {
          if (supplierRes.success && supplierRes.data) {
            setSupplier(supplierRes.data)
          } else {
            setError(supplierRes.error ?? 'Lỗi tải chi tiết')
          }
          
          if (statsRes.success && statsRes.data) {
            setStats(statsRes.data)
          }
          
          if (invoicesRes.success && invoicesRes.data) {
            setInvoices(invoicesRes.data.items)
          }
        }
      } catch (err) {
        if (isMounted) setError('Lỗi kết nối')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void fetchData()
    return () => { isMounted = false }
  }, [isOpen, supplierId])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Hồ sơ đối tác"
      size="xl"
    >
      <div className="space-y-6">
        {loading ? (
          <LoadingState />
        ) : error || !supplier ? (
          <ErrorState message={error ?? 'Không tìm thấy đối tác'} />
        ) : (
          <>
            {/* Basic Info */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center">
                  <div className="bg-primary-100 p-2 rounded-lg mr-3">
                    <Building2 className="h-6 w-6 text-primary-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{supplier.companyName}</h2>
                    <p className="text-sm text-gray-500 mt-1">Mã NCC: NCC{supplier.id.toString().padStart(4, '0')}</p>
                  </div>
                </div>
                <StatusBadge active={supplier.active} />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-4 border-t border-gray-200">
                <div>
                  <p className="text-sm text-gray-500">Số điện thoại</p>
                  <p className="font-medium text-gray-900">{supplier.phone || '---'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Địa chỉ</p>
                  <p className="font-medium text-gray-900">{supplier.address || '---'}</p>
                </div>
              </div>
            </div>

            {/* Financial Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center shadow-sm">
                <div className="bg-blue-100 p-3 rounded-full mr-4">
                  <FileText className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">Tổng giá trị đã nhập</p>
                  <p className="text-2xl font-bold text-gray-900">{formatVND(stats?.totalPurchased ?? supplier.totalPurchased ?? 0)}</p>
                </div>
              </div>
              
              <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center shadow-sm">
                <div className="bg-primary-100 p-3 rounded-full mr-4">
                  <CheckSquare className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">Số phiếu nhập đã xác nhận</p>
                  <p className="text-2xl font-bold text-gray-900">{stats?.confirmedInvoiceCount ?? 0}</p>
                </div>
              </div>
            </div>

            {/* Invoices List */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">Danh sách phiếu nhập gần nhất</h3>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden h-80 overflow-y-auto">
                {invoices.length === 0 ? (
                  <EmptyState message="Chưa có phiếu nhập nào" />
                ) : (
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">Mã phiếu</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">Số HĐ</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">Ngày nhập</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">Tổng tiền</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-500">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {invoices.map((inv) => (
                        <tr key={inv.id}>
                          <td className="px-4 py-3 font-semibold text-gray-900">{inv.receiptCode}</td>
                          <td className="px-4 py-3 font-mono text-gray-500">{inv.invoiceNumber}</td>
                          <td className="px-4 py-3 text-gray-500">{formatDate(inv.receivedDate)}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {formatVND(inv.grandTotal)}
                          </td>
                          <td className="px-4 py-3 text-center text-xs">
                            <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${
                              inv.status === 'xac_nhan' ? 'bg-green-100 text-green-800' : inv.status === 'huy' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {inv.status === 'xac_nhan' ? 'Đã xác nhận' : inv.status === 'huy' ? 'Đã hủy' : 'Nháp'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
