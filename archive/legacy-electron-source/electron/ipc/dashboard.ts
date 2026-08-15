import type { IpcMain } from 'electron'
import { handle } from './utils'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { getDashboardService } from '../services/dashboardService'

export function registerDashboardHandlers(ipcMain: IpcMain): void {
  handle(ipcMain, IPC_CHANNELS.DASHBOARD_STATS, () => {
    return getDashboardService().getStats()
  })
}
