import type { AppSettingsDTO } from '@shared/ipc-types'
import { command } from './client'
export const settings = { get: () => command<AppSettingsDTO>('get_settings'), update: (settings: AppSettingsDTO) => command<AppSettingsDTO>('update_settings', { settings }) }
