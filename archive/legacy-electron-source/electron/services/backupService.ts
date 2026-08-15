import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import unzipper from 'unzipper'
import { app } from 'electron'
import { closeDb, getDbPath, getSqlite, initializeDb } from '../db/connection'
import { getSettingsRepository } from '../repositories/settingsRepository'
import { operationCoordinator } from './operationCoordinator'
import { zipBackupDirectory } from './backup/backupArchiveService'
import { createBackupMetadata } from './backup/backupMetadataService'
import { extractAndValidateRestore } from './backup/restoreValidationService'
import type { BackupRuntime, BackupType } from './backup/backupTypes'
import type {
  BackupInfo,
  BackupResult,
  BackupStorageStats,
  RestoreResult,
} from '../../shared/ipc-types'

export const BACKUP_FILE_PATTERN =
  /^FeedInventory_Backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:_auto|_pre-restore)?\.zip$/

export function createDefaultBackupRuntime(): BackupRuntime {
  const userDataPath = app.getPath('userData')
  return {
    userDataPath,
    databasePath: getDbPath(),
    attachmentsPath: path.join(userDataPath, 'attachments'),
    tempRoot: os.tmpdir(),
    appVersion: app.getVersion(),
    sqlite: getSqlite(),
    closeDatabase: closeDb,
    openDatabase: initializeDb,
    validateRestoredDatabase: () => {
      getSqlite().prepare('SELECT COUNT(*) FROM products').get()
    },
  }
}

function backupTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
}

function backupFilename(type: BackupType): string {
  const suffix = type === 'automatic' ? '_auto' : type === 'pre_restore' ? '_pre-restore' : ''
  return `FeedInventory_Backup_${backupTimestamp()}${suffix}.zip`
}

function ensureWritableFolder(folder: string): void {
  fs.mkdirSync(folder, { recursive: true })
  fs.accessSync(folder, fs.constants.W_OK)
}

export async function createBackupSnapshot(
  destinationFolder: string,
  type: BackupType,
  runtime: BackupRuntime,
  archiveWriter: typeof zipBackupDirectory = zipBackupDirectory
): Promise<BackupResult> {
  ensureWritableFolder(destinationFolder)
  const temporaryRoot = fs.mkdtempSync(path.join(runtime.tempRoot, 'feed-backup-'))
  const staging = path.join(temporaryRoot, 'staging')
  const filename = backupFilename(type)
  const temporaryZip = path.join(temporaryRoot, filename)
  const finalPath = path.join(destinationFolder, filename)
  try {
    const databaseDirectory = path.join(staging, 'database')
    fs.mkdirSync(databaseDirectory, { recursive: true })
    const snapshotPath = path.join(databaseDirectory, 'feed-inventory.db')
    await runtime.sqlite.backup(snapshotPath)
    const snapshot = new Database(snapshotPath)
    const integrity = snapshot.pragma('integrity_check', { simple: true })
    snapshot.pragma('journal_mode = DELETE')
    snapshot.close()
    if (integrity !== 'ok') throw new Error('SQLite snapshot không toàn vẹn')

    const stagedAttachments = path.join(staging, 'attachments')
    if (fs.existsSync(runtime.attachmentsPath)) {
      fs.cpSync(runtime.attachmentsPath, stagedAttachments, { recursive: true })
    } else {
      fs.mkdirSync(stagedAttachments, { recursive: true })
    }
    const metadata = createBackupMetadata(runtime, snapshotPath, stagedAttachments, type)
    fs.writeFileSync(path.join(staging, 'metadata.json'), JSON.stringify(metadata, null, 2))
    await archiveWriter(staging, temporaryZip)
    fs.renameSync(temporaryZip, finalPath)
    return {
      success: true,
      filePath: finalPath,
      fileSize: fs.statSync(finalPath).size,
      createdAt: metadata.createdAt,
      databaseHash: metadata.databaseSha256,
      attachmentCount: metadata.attachmentCount,
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

export function createBackup(
  destinationFolder: string,
  type: BackupType = 'manual',
  runtime = createDefaultBackupRuntime()
): Promise<BackupResult> {
  return operationCoordinator.run(
    'backup_create',
    () => createBackupSnapshot(destinationFolder, type, runtime)
  )
}

async function preRestoreFolder(runtime: BackupRuntime): Promise<string> {
  const configured = (await getSettingsRepository().getAll()).backupFolder
  if (configured) {
    try {
      ensureWritableFolder(configured)
      return configured
    } catch {
      // Fall back to the application recovery directory.
    }
  }
  const fallback = path.join(runtime.userDataPath, 'recovery-backups')
  ensureWritableFolder(fallback)
  return fallback
}

export function restoreBackup(
  zipPath: string,
  runtime = createDefaultBackupRuntime()
): Promise<RestoreResult> {
  return operationCoordinator.run('backup_restore', async () => {
    const currentSchema = runtime.sqlite.prepare(
      'SELECT MAX(version) AS version FROM schema_migrations'
    ).get() as { version: number }
    const extractionDirectory = fs.mkdtempSync(path.join(runtime.tempRoot, 'feed-restore-'))
    const validated = await extractAndValidateRestore(
      zipPath,
      extractionDirectory,
      currentSchema.version
    )
    const recoveryFolder = await preRestoreFolder(runtime)
    const safetyBackup = await createBackupSnapshot(recoveryFolder, 'pre_restore', runtime)
    const rollbackDirectory = fs.mkdtempSync(path.join(runtime.tempRoot, 'feed-rollback-'))
    const rollbackDatabase = path.join(rollbackDirectory, 'feed-inventory.db')
    const rollbackAttachments = path.join(rollbackDirectory, 'attachments')
    runtime.closeDatabase()
    try {
      if (fs.existsSync(runtime.databasePath)) fs.renameSync(runtime.databasePath, rollbackDatabase)
      if (fs.existsSync(runtime.attachmentsPath)) {
        fs.renameSync(runtime.attachmentsPath, rollbackAttachments)
      }
      fs.copyFileSync(
        path.join(validated.directory, 'database', validated.metadata.databaseFilename),
        runtime.databasePath
      )
      const restoredAttachments = path.join(validated.directory, 'attachments')
      if (fs.existsSync(restoredAttachments)) {
        fs.cpSync(restoredAttachments, runtime.attachmentsPath, { recursive: true })
      }
      runtime.openDatabase()
      runtime.validateRestoredDatabase()
      fs.rmSync(rollbackDirectory, { recursive: true, force: true })
      fs.rmSync(validated.directory, { recursive: true, force: true })
      return {
        success: true,
        restartRequired: true,
        warnings: validated.warnings,
        preRestoreBackupPath: safetyBackup.filePath,
      }
    } catch (error) {
      runtime.closeDatabase()
      fs.rmSync(runtime.databasePath, { force: true })
      fs.rmSync(runtime.attachmentsPath, { recursive: true, force: true })
      if (fs.existsSync(rollbackDatabase)) fs.renameSync(rollbackDatabase, runtime.databasePath)
      if (fs.existsSync(rollbackAttachments)) {
        fs.renameSync(rollbackAttachments, runtime.attachmentsPath)
      }
      runtime.openDatabase()
      fs.rmSync(rollbackDirectory, { recursive: true, force: true })
      fs.rmSync(validated.directory, { recursive: true, force: true })
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        warnings: validated.warnings,
        preRestoreBackupPath: safetyBackup.filePath,
      }
    }
  })
}

export async function listBackups(folder: string): Promise<BackupInfo[]> {
  if (!folder || !fs.existsSync(folder)) return []
  const results: BackupInfo[] = []
  const filenames = fs.readdirSync(folder).filter((name) => BACKUP_FILE_PATTERN.test(name))
  for (const fileName of filenames) {
    const filePath = path.join(folder, fileName)
    try {
      const archive = await unzipper.Open.file(filePath)
      const metadataEntries = archive.files.filter((entry) => entry.path === 'metadata.json')
      if (metadataEntries.length !== 1) throw new Error('Metadata phải xuất hiện đúng một lần')
      const parsed: unknown = JSON.parse((await metadataEntries[0].buffer()).toString())
      if (!parsed || typeof parsed !== 'object') throw new Error('Metadata không hợp lệ')
      const metadata = parsed as Record<string, unknown>
      if (
        metadata['formatVersion'] !== 1 ||
        typeof metadata['createdAt'] !== 'string' ||
        typeof metadata['appVersion'] !== 'string' ||
        typeof metadata['schemaVersion'] !== 'number'
      ) throw new Error('Metadata không hợp lệ')
      results.push({
        fileName,
        filePath,
        fileSize: fs.statSync(filePath).size,
        createdAt: metadata['createdAt'],
        formatVersion: 1,
        appVersion: metadata['appVersion'],
        schemaVersion: metadata['schemaVersion'],
        valid: true,
        databaseHash: typeof metadata['databaseSha256'] === 'string'
          ? metadata['databaseSha256']
          : undefined,
      })
    } catch (error) {
      results.push({
        fileName,
        filePath,
        fileSize: fs.statSync(filePath).size,
        createdAt: fs.statSync(filePath).mtime.toISOString(),
        formatVersion: 0,
        appVersion: '',
        schemaVersion: 0,
        valid: false,
        validationError: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function enforceRetention(folder: string, keep: number): Promise<void> {
  const automatic = (await listBackups(folder))
    .filter((backup) => backup.fileName.endsWith('_auto.zip'))
    .slice(Math.max(1, keep))
  for (const backup of automatic) fs.unlinkSync(backup.filePath)
}

function directorySize(directory: string): number {
  if (!fs.existsSync(directory)) return 0
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const entryPath = path.join(directory, entry.name)
    return total + (entry.isDirectory() ? directorySize(entryPath) : fs.statSync(entryPath).size)
  }, 0)
}

export function getBackupStorageStats(folder: string): BackupStorageStats {
  const runtime = createDefaultBackupRuntime()
  let backupFolderWritable = false
  if (folder) {
    try {
      ensureWritableFolder(folder)
      backupFolderWritable = true
    } catch {
      backupFolderWritable = false
    }
  }
  return {
    databaseSize: fs.existsSync(runtime.databasePath) ? fs.statSync(runtime.databasePath).size : 0,
    attachmentsSize: directorySize(runtime.attachmentsPath),
    backupFolderWritable,
  }
}
