import type { IpcMain } from 'electron'
import type { IpcResult } from '../../shared/ipc-types'

/**
 * Wraps an async handler to return IpcResult<T> and catch errors.
 * All IPC handlers use this wrapper for consistent error handling.
 */
export function wrapHandler<T>(
  fn: (...args: unknown[]) => Promise<T>
): (...args: unknown[]) => Promise<IpcResult<T>> {
  return async (...args: unknown[]) => {
    try {
      const data = await fn(...args)
      return { success: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[IPC Error]', message)
      return { success: false, error: message }
    }
  }
}

/**
 * Register an IPC handler with error wrapping.
 */
export function handle<T>(
  ipcMain: IpcMain,
  channel: string,
  handler: (_event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T
): void {
  ipcMain.handle(channel, async (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => {
    try {
      const data = await handler(event, ...args)
      return { success: true, data } satisfies IpcResult<T>
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[IPC Error] ${channel}:`, message)
      return { success: false, error: message } satisfies IpcResult<T>
    }
  })
}
