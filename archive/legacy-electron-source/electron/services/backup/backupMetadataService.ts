import fs from 'fs'
import path from 'path'
import { sha256File } from '../../utils/fileSafety'
import type { AttachmentManifestItem, BackupMetadata, BackupRuntime, BackupType } from './backupTypes'

function walkFiles(root: string, current = root): string[] {
  if (!fs.existsSync(current)) return []
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(current, entry.name)
    return entry.isDirectory() ? walkFiles(root, fullPath) : [path.relative(root, fullPath)]
  })
}

export function buildAttachmentManifest(directory: string): AttachmentManifestItem[] {
  return walkFiles(directory).map((relativePath) => {
    const filePath = path.join(directory, relativePath)
    return {
      relativePath: relativePath.split(path.sep).join('/'),
      fileSize: fs.statSync(filePath).size,
      sha256: sha256File(filePath),
    }
  })
}

export function createBackupMetadata(
  runtime: BackupRuntime,
  databaseSnapshot: string,
  attachmentsDirectory: string,
  backupType: BackupType
): BackupMetadata {
  const attachments = buildAttachmentManifest(attachmentsDirectory)
  const schema = runtime.sqlite.prepare(
    'SELECT MAX(version) AS version FROM schema_migrations'
  ).get() as { version: number }
  return {
    formatVersion: 1,
    backupType,
    appVersion: runtime.appVersion,
    schemaVersion: schema.version,
    createdAt: new Date().toISOString(),
    platform: process.platform,
    databaseFilename: 'feed-inventory.db',
    attachmentCount: attachments.length,
    databaseSha256: sha256File(databaseSnapshot),
    files: ['metadata.json', 'database/feed-inventory.db', 'attachments/'],
    attachments,
  }
}
