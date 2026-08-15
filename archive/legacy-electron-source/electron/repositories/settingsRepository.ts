import { getDb } from '../db/connection'
import { appSettings } from '../db/schema'
import type { AppSettingsDTO } from '../../shared/ipc-types'

const DEFAULT_SETTINGS: AppSettingsDTO = {
  storeName: 'Cửa hàng thức ăn chăn nuôi',
  taxCode: '',
  address: '',
  phone: '',
  currency: 'VND',
  backupFolder: '',
  automaticBackupEnabled: false,
  backupRetentionCount: 10,
  lastSuccessfulBackupDate: '',
  lastBackupFile: '',
  lastBackupError: '',
}

class SettingsRepository {
  async getAll(): Promise<AppSettingsDTO> {
    const db = getDb()
    const rows = await db.select().from(appSettings)
    const map: Record<string, string> = {}
    for (const row of rows) {
      map[row.key] = row.value
    }

    return {
      storeName: map['store_name'] ?? DEFAULT_SETTINGS.storeName,
      taxCode: map['tax_code'] ?? '',
      address: map['address'] ?? '',
      phone: map['phone'] ?? '',
      currency: map['currency'] ?? 'VND',
      backupFolder: map['backup_folder'] ?? '',
      automaticBackupEnabled: map['automatic_backup_enabled'] === 'true',
      backupRetentionCount: parseInt(map['backup_retention_count'] ?? '10', 10),
      lastSuccessfulBackupDate: map['last_successful_backup_date'] ?? '',
      lastBackupFile: map['last_backup_file'] ?? '',
      lastBackupError: map['last_backup_error'] ?? '',
    }
  }

  async updateAll(settings: Partial<AppSettingsDTO>): Promise<AppSettingsDTO> {
    const db = getDb()
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

    const keyMap: Record<string, string> = {
      storeName: 'store_name',
      taxCode: 'tax_code',
      address: 'address',
      phone: 'phone',
      currency: 'currency',
      backupFolder: 'backup_folder',
      automaticBackupEnabled: 'automatic_backup_enabled',
      backupRetentionCount: 'backup_retention_count',
      lastSuccessfulBackupDate: 'last_successful_backup_date',
      lastBackupFile: 'last_backup_file',
      lastBackupError: 'last_backup_error',
    }

    for (const [field, dbKey] of Object.entries(keyMap)) {
      const value = settings[field as keyof AppSettingsDTO]
      if (value !== undefined) {
        const strValue = String(value)
        await db
          .insert(appSettings)
          .values({ key: dbKey, value: strValue, updatedAt: now })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { value: strValue, updatedAt: now },
          })
      }
    }

    return this.getAll()
  }
}

let _instance: SettingsRepository | null = null

export function getSettingsRepository(): SettingsRepository {
  if (!_instance) _instance = new SettingsRepository()
  return _instance
}
