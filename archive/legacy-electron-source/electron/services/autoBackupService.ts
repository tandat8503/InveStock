import fs from 'fs'
import type { AppSettingsDTO, BackupResult } from '../../shared/ipc-types'
import { getSettingsRepository } from '../repositories/settingsRepository'
import { createBackup, enforceRetention } from './backupService'

export interface AutoBackupSettingsStore {
  getAll: () => Promise<AppSettingsDTO>
  updateAll: (settings: Partial<AppSettingsDTO>) => Promise<AppSettingsDTO>
}

export interface AutoBackupDependencies {
  settings: AutoBackupSettingsStore
  create: (folder: string) => Promise<BackupResult>
  retain: (folder: string, keep: number) => Promise<void>
  ensureWritable: (folder: string) => void
}

function defaultDependencies(): AutoBackupDependencies {
  return {
    settings: getSettingsRepository(),
    create: (folder) => createBackup(folder, 'automatic'),
    retain: enforceRetention,
    ensureWritable: (folder) => {
      fs.mkdirSync(folder, { recursive: true })
      fs.accessSync(folder, fs.constants.W_OK)
    },
  }
}

export async function runAutoBackupIfNeeded(
  now = new Date(),
  dependencies: AutoBackupDependencies = defaultDependencies()
): Promise<boolean> {
  const settings = await dependencies.settings.getAll()
  const today = now.toISOString().slice(0, 10)
  if (
    !settings.automaticBackupEnabled ||
    !settings.backupFolder ||
    settings.lastSuccessfulBackupDate.slice(0, 10) === today
  ) return false
  try {
    dependencies.ensureWritable(settings.backupFolder)
    const result = await dependencies.create(settings.backupFolder)
    await dependencies.retain(settings.backupFolder, settings.backupRetentionCount)
    await dependencies.settings.updateAll({
      lastSuccessfulBackupDate: result.createdAt,
      lastBackupFile: result.filePath ?? '',
      lastBackupError: '',
    })
    return true
  } catch (error) {
    await dependencies.settings.updateAll({
      lastBackupError: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
