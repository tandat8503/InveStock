import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import archiver, { type Archiver } from 'archiver'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb, teardownTestDb } from '../helpers/testDatabase'
import { getSqlite } from '../../electron/db/connection'
import {
  createBackupSnapshot,
  restoreBackup,
} from '../../electron/services/backupService'
import { zipBackupDirectory } from '../../electron/services/backup/backupArchiveService'
import type { BackupRuntime } from '../../electron/services/backup/backupTypes'
import { extractAndValidateRestore } from '../../electron/services/backup/restoreValidationService'

describe('Phase 6 restore', () => {
  let root: string
  let runtime: BackupRuntime
  let backupPath: string

  beforeEach(async () => {
    setupTestDb()
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase6-restore-'))
    const userDataPath = path.join(root, 'userData')
    const attachmentsPath = path.join(userDataPath, 'attachments')
    fs.mkdirSync(attachmentsPath, { recursive: true })
    fs.writeFileSync(path.join(attachmentsPath, 'orphan.pdf'), 'backup-attachment')
    const databasePath = path.join(userDataPath, 'feed-inventory.db')
    fs.writeFileSync(databasePath, 'current-database-before-restore')
    getSqlite().prepare(`
      INSERT INTO products (
        product_code, product_name, animal_category, package_weight_grams,
        inventory_unit, current_sale_price
      ) VALUES ('BEFORE', 'Before backup', 'khac', 1, 'Bao', 1)
    `).run()
    runtime = {
      userDataPath,
      databasePath,
      attachmentsPath,
      tempRoot: root,
      appVersion: '1.0.0-test',
      sqlite: getSqlite(),
      closeDatabase: () => undefined,
      openDatabase: () => undefined,
      validateRestoredDatabase: () => {
        const database = new Database(databasePath, { readonly: true })
        try {
          database.prepare('SELECT COUNT(*) FROM products').get()
        } finally {
          database.close()
        }
      },
    }
    const backup = await createBackupSnapshot(path.join(root, 'source'), 'manual', runtime)
    backupPath = backup.filePath ?? ''
    getSqlite().prepare("DELETE FROM products WHERE product_code = 'BEFORE'").run()
    getSqlite().prepare(`
      INSERT INTO products (
        product_code, product_name, animal_category, package_weight_grams,
        inventory_unit, current_sale_price
      ) VALUES ('AFTER', 'After backup', 'khac', 1, 'Bao', 1)
    `).run()
    fs.writeFileSync(path.join(attachmentsPath, 'orphan.pdf'), 'changed-after-backup')
  })

  afterEach(() => {
    teardownTestDb()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('restore dữ liệu/attachment đúng, tạo pre-restore ở recovery và trả warning orphan', async () => {
    const result = await restoreBackup(backupPath, runtime)
    expect(result.success).toBe(true)
    expect(result.preRestoreBackupPath).toContain(path.join('userData', 'recovery-backups'))
    expect(fs.existsSync(result.preRestoreBackupPath ?? '')).toBe(true)
    const restored = new Database(runtime.databasePath, { readonly: true })
    expect(restored.prepare('SELECT product_code FROM products').pluck().all()).toContain('BEFORE')
    expect(restored.prepare('SELECT product_code FROM products').pluck().all()).not.toContain('AFTER')
    restored.close()
    expect(fs.readFileSync(path.join(runtime.attachmentsPath, 'orphan.pdf'), 'utf8')).toBe('backup-attachment')
    expect(result.warnings?.some((warning) => warning.includes('không có record DB'))).toBe(true)
  })

  it('corrupted ZIP và missing metadata bị chặn trước khi thay dữ liệu', async () => {
    const corrupted = path.join(root, 'corrupted.zip')
    fs.writeFileSync(corrupted, 'not-a-zip')
    await expect(restoreBackup(corrupted, runtime)).rejects.toThrow()
    const emptyStage = path.join(root, 'empty-stage')
    fs.mkdirSync(emptyStage)
    const missing = path.join(root, 'missing.zip')
    await zipBackupDirectory(emptyStage, missing)
    await expect(restoreBackup(missing, runtime)).rejects.toThrow('metadata.json')
    expect(fs.readFileSync(runtime.databasePath, 'utf8')).toBe('current-database-before-restore')
  })

  it('hash sai và schema mới hơn bị chặn', async () => {
    const invalidHash = await archiveWithMetadata({ databaseSha256: 'bad' }, 'bad-hash.zip')
    await expect(restoreBackup(invalidHash, runtime)).rejects.toThrow('Hash database')
    const newer = await archiveWithMetadata({ schemaVersion: 999 }, 'newer.zip')
    await expect(restoreBackup(newer, runtime)).rejects.toThrow('phiên bản ứng dụng mới hơn')
  })

  it('absolute path, backslash traversal và ../ bị utility chặn', async () => {
    const { assertSafeArchivePath } = await import('../../electron/utils/fileSafety')
    expect(() => assertSafeArchivePath('/absolute/file')).toThrow()
    expect(() => assertSafeArchivePath('C:\\absolute\\file')).toThrow()
    expect(() => assertSafeArchivePath('..\\escape')).toThrow()
    expect(() => assertSafeArchivePath('../escape')).toThrow()
  })

  it('duplicate archive entries và symlink bị chặn', async () => {
    const duplicate = path.join(root, 'duplicate.zip')
    await writeCustomArchive(duplicate, (archive) => {
      archive.append('one', { name: 'metadata.json' })
      archive.append('two', { name: 'metadata.json' })
    })
    await expect(extractAndValidateRestore(
      duplicate,
      fs.mkdtempSync(path.join(root, 'extract-')),
      5
    )).rejects.toThrow('entry trùng')

    const symlink = path.join(root, 'symlink.zip')
    await writeCustomArchive(symlink, (archive) => {
      archive.symlink('unsafe-link', '../outside')
    })
    await expect(extractAndValidateRestore(
      symlink,
      fs.mkdtempSync(path.join(root, 'extract-')),
      5
    )).rejects.toThrow(/symlink|không an toàn/)
  })

  it('giới hạn số file và tổng uncompressed size chặn zip bomb', async () => {
    const many = path.join(root, 'many.zip')
    await writeCustomArchive(many, (archive) => {
      archive.append('1', { name: 'one.txt' })
      archive.append('2', { name: 'two.txt' })
    })
    await expect(extractAndValidateRestore(
      many,
      fs.mkdtempSync(path.join(root, 'extract-')),
      5,
      { maximumFiles: 1, maximumUncompressedSize: 100 }
    )).rejects.toThrow('giới hạn')

    const large = path.join(root, 'large.zip')
    await writeCustomArchive(large, (archive) => {
      archive.append('1234567890', { name: 'large.txt' })
    })
    await expect(extractAndValidateRestore(
      large,
      fs.mkdtempSync(path.join(root, 'extract-')),
      5,
      { maximumFiles: 10, maximumUncompressedSize: 5 }
    )).rejects.toThrow('giới hạn')
  })

  it('restore lỗi sau swap rollback database, attachments và mở connection lại', async () => {
    let openCount = 0
    runtime.openDatabase = () => { openCount += 1 }
    runtime.validateRestoredDatabase = () => { throw new Error('post-swap failure') }
    const result = await restoreBackup(backupPath, runtime)
    expect(result.success).toBe(false)
    expect(result.error).toContain('post-swap failure')
    expect(fs.readFileSync(runtime.databasePath, 'utf8')).toBe('current-database-before-restore')
    expect(fs.readFileSync(path.join(runtime.attachmentsPath, 'orphan.pdf'), 'utf8')).toBe('changed-after-backup')
    expect(openCount).toBeGreaterThanOrEqual(2)
    expect(result.preRestoreBackupPath).toBeTruthy()
  })

  async function archiveWithMetadata(
    overrides: Record<string, unknown>,
    filename: string
  ): Promise<string> {
    const stage = fs.mkdtempSync(path.join(root, 'custom-stage-'))
    const databaseDirectory = path.join(stage, 'database')
    fs.mkdirSync(path.join(stage, 'attachments'), { recursive: true })
    fs.mkdirSync(databaseDirectory, { recursive: true })
    const databasePath = path.join(databaseDirectory, 'feed-inventory.db')
    await runtime.sqlite.backup(databasePath)
    const { sha256File } = await import('../../electron/utils/fileSafety')
    const metadata = {
      formatVersion: 1,
      backupType: 'manual',
      appVersion: '1.0.0-test',
      schemaVersion: 5,
      createdAt: new Date().toISOString(),
      platform: process.platform,
      databaseFilename: 'feed-inventory.db',
      attachmentCount: 0,
      databaseSha256: sha256File(databasePath),
      files: ['metadata.json', 'database/feed-inventory.db', 'attachments/'],
      attachments: [],
      ...overrides,
    }
    fs.writeFileSync(path.join(stage, 'metadata.json'), JSON.stringify(metadata))
    const output = path.join(root, filename)
    await zipBackupDirectory(stage, output)
    fs.rmSync(stage, { recursive: true, force: true })
    return output
  }

  async function writeCustomArchive(
    output: string,
    addEntries: (archive: Archiver) => void
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createWriteStream(output)
      const archive = archiver('zip')
      stream.on('close', resolve)
      stream.on('error', reject)
      archive.on('error', reject)
      archive.pipe(stream)
      addEntries(archive)
      void archive.finalize()
    })
  }
})
