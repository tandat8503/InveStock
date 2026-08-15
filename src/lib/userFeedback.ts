import type { BackupStatusDTO } from '@shared/ipc-types'
import type { CommandResult } from './commands/client'

export const RESTORE_CONFIRMATION = 'Ứng dụng sẽ tự tạo bản sao dữ liệu hiện tại trước khi khôi phục. Khôi phục sẽ thay thế dữ liệu hiện tại. Tiếp tục?'

export function commandError<T>(result: CommandResult<T>, fallback: string): string {
  return result.success ? '' : result.error || fallback
}

export function productCodeFieldError<T>(result: CommandResult<T>): string | undefined {
  return result.errorInfo?.code === 'PRODUCT_CODE_EXISTS' || result.errorInfo?.code === 'CONFLICT'
    ? 'Mã sản phẩm đã tồn tại'
    : undefined
}

export function backupStatusText(status: BackupStatusDTO): { label: string; warning?: string } {
  if (status.usingFallback) {
    return {
      label: 'Sao lưu cần chú ý',
      warning: 'Không thể sao lưu vào thư mục bạn đã chọn. InveStock vẫn đang giữ một bản sao an toàn trên máy.',
    }
  }
  return { label: status.healthy ? 'Dữ liệu an toàn' : 'Sao lưu cần chú ý' }
}
