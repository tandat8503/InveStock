import type Database from 'better-sqlite3'

export type BackupType = 'manual' | 'automatic' | 'pre_restore'

export interface AttachmentManifestItem {
  relativePath: string
  fileSize: number
  sha256: string
}

export interface BackupMetadata {
  formatVersion: 1
  backupType: BackupType
  appVersion: string
  schemaVersion: number
  createdAt: string
  platform: string
  databaseFilename: string
  attachmentCount: number
  databaseSha256: string
  files: string[]
  attachments: AttachmentManifestItem[]
}

export interface BackupRuntime {
  userDataPath: string
  databasePath: string
  attachmentsPath: string
  tempRoot: string
  appVersion: string
  sqlite: Database.Database
  closeDatabase: () => void
  openDatabase: () => void
  validateRestoredDatabase: () => void
}
