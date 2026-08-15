import { invoke } from '@tauri-apps/api/core'

export interface CommandError { code: string; message: string; details: Record<string, unknown> }
export interface CommandResult<T> { success: boolean; data?: T; error?: string; errorInfo?: CommandError }

function parseError(value: unknown): CommandError {
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    if (typeof record.code === 'string' && typeof record.message === 'string') {
      return { code: record.code, message: record.message, details: typeof record.details === 'object' && record.details !== null ? record.details as Record<string, unknown> : {} }
    }
  }
  return { code: 'INTERNAL_ERROR', message: 'Có lỗi khi xử lý dữ liệu. Vui lòng thử lại.', details: {} }
}

export async function command<T>(name: string, args?: Record<string, unknown>): Promise<CommandResult<T>> {
  try { return { success: true, data: await invoke<T>(name, args) } }
  catch (error: unknown) { const parsed = parseError(error); return { success: false, error: parsed.message, errorInfo: parsed } }
}
