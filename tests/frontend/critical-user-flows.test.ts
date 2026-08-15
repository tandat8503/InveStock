import { describe, expect, it } from 'vitest'
import { backupStatusText, commandError, productCodeFieldError, RESTORE_CONFIRMATION } from '../../src/lib/userFeedback'
import type { BackupStatusDTO } from '../../shared/ipc-types'

const healthy: BackupStatusDTO = {
  healthy: true, folderWritable: true, usingFallback: false, message: 'OK',
  lastBackupDate: '2026-08-07', lastBackupFile: 'backup.zip', daysSinceLastBackup: 0,
}

describe('critical low-tech user feedback', () => {
  it('maps duplicate product structured error to the product-code field', () => {
    expect(productCodeFieldError({ success: false, errorInfo: { code: 'PRODUCT_CODE_EXISTS', message: 'duplicate', details: {} } })).toBe('Mã sản phẩm đã tồn tại')
  })

  it('keeps purchase draft save errors visible instead of treating failure as success', () => {
    expect(commandError({ success: false, error: 'Không thể lưu phiếu nhập' }, 'fallback')).toBe('Không thể lưu phiếu nhập')
  })

  it('shows the backend insufficient-stock message', () => {
    expect(commandError({ success: false, error: 'Không đủ tồn kho cho sản phẩm Cám heo' }, 'fallback')).toContain('Không đủ tồn kho')
  })

  it('labels a healthy backup as safe', () => {
    expect(backupStatusText(healthy)).toEqual({ label: 'Dữ liệu an toàn' })
  })

  it('shows a protected warning when backup uses fallback storage', () => {
    const view = backupStatusText({ ...healthy, folderWritable: false, usingFallback: true })
    expect(view.label).toBe('Sao lưu cần chú ý')
    expect(view.warning).toContain('vẫn đang giữ một bản sao an toàn')
  })

  it('uses an explicit destructive restore confirmation', () => {
    expect(RESTORE_CONFIRMATION).toContain('thay thế dữ liệu hiện tại')
    expect(RESTORE_CONFIRMATION).toContain('tự tạo bản sao')
  })

  it('shows settings save errors', () => {
    expect(commandError({ success: false }, 'Không thể lưu cài đặt.')).toBe('Không thể lưu cài đặt.')
  })
})
