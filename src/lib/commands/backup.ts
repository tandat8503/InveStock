import type { BackupStatusDTO } from '@shared/ipc-types'
import { command } from './client'
export const backup = { create: (destPath: string) => command<string>('create_backup', { destPath }), restore: (sourcePath: string) => command<boolean>('restore_backup', { sourcePath }), status: () => command<BackupStatusDTO>('get_backup_status'), healthCheck: () => command<BackupStatusDTO>('run_backup_health_check') }
