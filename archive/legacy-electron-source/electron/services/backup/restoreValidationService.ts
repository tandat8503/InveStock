import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import unzipper from 'unzipper'
import { assertSafeArchivePath, safeResolve, sha256File } from '../../utils/fileSafety'
import type { BackupMetadata } from './backupTypes'

const REQUIRED_TABLES = ['products', 'schema_migrations', 'app_settings', 'attachments']
const MAX_ARCHIVE_FILES = 10_000
const MAX_UNCOMPRESSED_SIZE = 2 * 1024 * 1024 * 1024

export interface ValidatedRestore {
  directory: string
  metadata: BackupMetadata
  warnings: string[]
}

function isBackupMetadata(value: unknown): value is BackupMetadata {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record['formatVersion'] === 1 &&
    typeof record['backupType'] === 'string' &&
    typeof record['appVersion'] === 'string' &&
    typeof record['schemaVersion'] === 'number' &&
    typeof record['databaseFilename'] === 'string' &&
    typeof record['databaseSha256'] === 'string' &&
    Array.isArray(record['attachments'])
}

async function extractEntry(
  entry: unzipper.File,
  destination: string
): Promise<void> {
  const target = safeResolve(destination, entry.path)
  if (entry.type === 'Directory') {
    fs.mkdirSync(target, { recursive: true })
    return
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  await new Promise<void>((resolve, reject) => {
    entry.stream()
      .pipe(fs.createWriteStream(target, { flags: 'wx' }))
      .on('finish', resolve)
      .on('error', reject)
  })
}

export async function extractAndValidateRestore(
  zipPath: string,
  destination: string,
  currentSchemaVersion: number,
  limits: { maximumFiles: number; maximumUncompressedSize: number } = {
    maximumFiles: MAX_ARCHIVE_FILES,
    maximumUncompressedSize: MAX_UNCOMPRESSED_SIZE,
  }
): Promise<ValidatedRestore> {
  if (path.extname(zipPath).toLowerCase() !== '.zip') throw new Error('Backup phải là file ZIP')
  let totalSize = 0
  const paths = new Set<string>()
  try {
    const archive = await unzipper.Open.file(zipPath)
    for (const entry of archive.files) {
      assertSafeArchivePath(entry.path)
      if (paths.has(entry.path)) throw new Error(`Backup có entry trùng: ${entry.path}`)
      paths.add(entry.path)
      totalSize += entry.uncompressedSize
      if (paths.size > limits.maximumFiles || totalSize > limits.maximumUncompressedSize) {
        throw new Error('Backup vượt giới hạn giải nén')
      }
      if (entry.type !== 'File' && entry.type !== 'Directory') {
        throw new Error('Backup chứa symlink hoặc loại file không an toàn')
      }
      const unixFileType = (entry.externalFileAttributes >>> 16) & 0o170000
      if (unixFileType === 0o120000) {
        throw new Error('Backup chứa symlink không an toàn')
      }
      await extractEntry(entry, destination)
    }
    if (!paths.has('metadata.json')) throw new Error('Thiếu metadata.json')
    const metadataValue: unknown = JSON.parse(
      fs.readFileSync(path.join(destination, 'metadata.json'), 'utf8')
    )
    if (!isBackupMetadata(metadataValue)) throw new Error('Metadata backup không hợp lệ')
    const metadata = metadataValue
    if (!metadata.appVersion.trim()) throw new Error('Thiếu appVersion')
    if (metadata.schemaVersion > currentSchemaVersion) {
      throw new Error('Bản backup được tạo bởi phiên bản ứng dụng mới hơn')
    }
    if (metadata.databaseFilename !== 'feed-inventory.db') {
      throw new Error('Tên database backup không hợp lệ')
    }
    const databasePath = path.join(destination, 'database', metadata.databaseFilename)
    if (!paths.has(`database/${metadata.databaseFilename}`) || !fs.existsSync(databasePath)) {
      throw new Error('Thiếu database trong backup')
    }
    if (sha256File(databasePath) !== metadata.databaseSha256) {
      throw new Error('Hash database backup không hợp lệ')
    }
    const database = new Database(databasePath, { readonly: true })
    try {
      const integrity = database.pragma('integrity_check', { simple: true })
      const tables = database.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      ).pluck().all() as string[]
      if (integrity !== 'ok' || !REQUIRED_TABLES.every((table) => tables.includes(table))) {
        throw new Error('Database backup không toàn vẹn hoặc thiếu bảng bắt buộc')
      }
      const migration = database.prepare(
        'SELECT MAX(version) AS version FROM schema_migrations'
      ).get() as { version: number }
      if (migration.version !== metadata.schemaVersion) {
        throw new Error('schema_migrations không khớp metadata')
      }
      const warnings = validateAttachments(database, destination, metadata)
      return { directory: destination, metadata, warnings }
    } finally {
      database.close()
    }
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true })
    throw error
  }
}

function validateAttachments(
  database: Database.Database,
  directory: string,
  metadata: BackupMetadata
): string[] {
  const warnings: string[] = []
  if (new Set(metadata.attachments.map((item) => item.relativePath)).size !== metadata.attachments.length) {
    throw new Error('Attachment manifest có đường dẫn trùng')
  }
  const manifest = new Map(metadata.attachments.map((item) => [item.relativePath, item]))
  const records = database.prepare('SELECT relative_path FROM attachments').pluck().all() as string[]
  for (const relativePathValue of records) {
    const relativePath = relativePathValue.split(path.sep).join('/')
    if (!manifest.has(relativePath)) warnings.push(`File đính kèm trong DB bị thiếu: ${relativePath}`)
  }
  for (const [relativePath, item] of manifest) {
    assertSafeArchivePath(relativePath)
    const filePath = safeResolve(path.join(directory, 'attachments'), relativePath)
    if (!fs.existsSync(filePath)) {
      warnings.push(`File đính kèm trong manifest bị thiếu: ${relativePath}`)
    } else if (fs.statSync(filePath).size !== item.fileSize || sha256File(filePath) !== item.sha256) {
      warnings.push(`File đính kèm sai kích thước hoặc hash: ${relativePath}`)
    }
    if (!records.some((record) => record.split(path.sep).join('/') === relativePath)) {
      warnings.push(`File đính kèm không có record DB: ${relativePath}`)
    }
  }
  const attachmentRoot = path.join(directory, 'attachments')
  for (const relativePath of listRelativeFiles(attachmentRoot)) {
    if (!manifest.has(relativePath)) {
      warnings.push(`File trong ZIP không có manifest: ${relativePath}`)
    }
  }
  return warnings
}

function listRelativeFiles(root: string, current = root): string[] {
  if (!fs.existsSync(current)) return []
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(current, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Attachments chứa symlink không an toàn')
    return entry.isDirectory()
      ? listRelativeFiles(root, fullPath)
      : [path.relative(root, fullPath).split(path.sep).join('/')]
  })
}
