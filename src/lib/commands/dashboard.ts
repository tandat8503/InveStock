import type { DashboardAnalyticsDTO, DashboardQueryParams } from '@shared/ipc-types'
import { command } from './client'

export const dashboard = {
  analytics: (params: DashboardQueryParams) =>
    command<DashboardAnalyticsDTO>('get_dashboard_analytics', { params }),
}
