import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import unzipper from 'unzipper'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb, teardownTestDb } from '../helpers/testDatabase'
import { getSqlite } from '../../electron/db/connection'
import {
  createBackupSnapshot,
  enforceRetention,
  listBackups,
} from '../../electron/services/backupService'
import type { BackupRuntime } from '../../electron/services/backup/backupTypes'
import { sha256File } from '../../electron/utils/fileSafety'

describe('Phase 6 backup', () => {
  let root: string
  let runtime: BackupRuntime

  beforeEach(() => {
    setupTestDb()
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase6-backup-'))
    const attachmentsPath = path.join(root, 'userData', 'attachments')
    fs.mkdirSync(path.join(attachmentsPath, 'purchase_invoice', '1'), { recursive: true })
    fs.writeFileSync(path.join(attachmentsPath, 'purchase_invoice', '1', 'proof.pdf'), 'attachment')
    runtime = {
      userDataPath: path.join(root, 'userData'),
      databasePath: path.join(root, 'userData', 'feed-inventory.db'),
      attachmentsPath,
      tempRoot: root,
      appVersion: '1.0.0-test',
      sqlite: getSqlite(),
      closeDatabase: () => undefined,
      openDatabase: () => undefined,
      validateRestoredDatabase: () => undefined,
    }
  })

  afterEach(() => {
    teardownTestDb()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('snapshot better-sqlite3 gồm data vừa commit cả khi WAL và ZIP/metadata/hash đúng', async () => {
    runtime.sqlite.pragma('journal_mode = WAL')
    runtime.sqlite.prepare(`
      INSERT INTO products (
        product_code, product_name, animal_category, package_weight_grams,
        inventory_unit, current_sale_price
      ) VALUES ('P1', 'One', 'khac', 1, 'Bao', 1)
    `).run()
    const destination = path.join(root, 'backups')
    const result = await createBackupSnapshot(destination, 'manual', runtime)
    expect(result.filePath).toBeTruthy()
    const archive = await unzipper.Open.file(result.filePath ?? '')
    const names = archive.files.map((entry) => entry.path)
    expect(names).toEqual(expect.arrayContaining([
      'metadata.json',
      'database/feed-inventory.db',
      'attachments/purchase_invoice/1/proof.pdf',
    ]))
    expect(names.some((name) => name.endsWith('-wal') || name.endsWith('-shm'))).toBe(false)
    const metadataEntry = archive.files.find((entry) => entry.path === 'metadata.json')
    const databaseEntry = archive.files.find((entry) => entry.path === 'database/feed-inventory.db')
    expect(metadataEntry).toBeDefined()
    expect(databaseEntry).toBeDefined()
    const metadata = JSON.parse((await metadataEntry?.buffer())?.toString() ?? '{}') as {
      appVersion: string
      databaseSha256: string
      attachments: { relativePath: string; fileSize: number; sha256: string }[]
    }
    const extracted = path.join(root, 'snapshot.db')
    fs.writeFileSync(extracted, await databaseEntry?.buffer() ?? Buffer.alloc(0))
    const snapshot = new Database(extracted, { readonly: true })
    expect(snapshot.prepare('SELECT product_code FROM products').pluck().get()).toBe('P1')
    snapshot.close()
    expect(metadata.appVersion).toBe('1.0.0-test')
    expect(metadata.databaseSha256).toBe(sha256File(extracted))
    expect(metadata.attachments).toHaveLength(1)
    const manifestItem = metadata.attachments[0]
    expect(manifestItem?.relativePath).toBe('purchase_invoice/1/proof.pdf')
    expect(manifestItem?.sha256).toHaveLength(64)
  })

  it('atomic rename và cleanup temp khi zip lỗi, không để ZIP nửa chừng', async () => {
    const destination = path.join(root, 'backups')
    await expect(createBackupSnapshot(
      destination,
      'manual',
      runtime,
      () => Promise.reject(new Error('zip failed'))
    )).rejects.toThrow('zip failed')
    expect(fs.readdirSync(destination)).toEqual([])
    expect(fs.readdirSync(root).filter((name) => name.startsWith('feed-backup-'))).toEqual([])
  })

  it('backup list chỉ scan pattern app và đánh dấu file hỏng', async () => {
    const destination = path.join(root, 'backups')
    const valid = await createBackupSnapshot(destination, 'manual', runtime)
    fs.writeFileSync(path.join(destination, 'other.zip'), 'ignored')
    fs.writeFileSync(
      path.join(destination, 'FeedInventory_Backup_2026-01-01_00-00-00_auto.zip'),
      'broken'
    )
    const list = await listBackups(destination)
    expect(list).toHaveLength(2)
    expect(list.find((item) => item.filePath === valid.filePath)?.valid).toBe(true)
    expect(list.find((item) => !item.valid)?.validationError).toBeTruthy()
  })

  it('retention chỉ xóa automatic, giữ manual và pre-restore', async () => {
    const destination = path.join(root, 'retention')
    const source = await createBackupSnapshot(destination, 'manual', runtime)
    const sourcePath = source.filePath ?? ''
    const filenames = [
      'FeedInventory_Backup_2026-01-01_00-00-00_auto.zip',
      'FeedInventory_Backup_2026-01-02_00-00-00_auto.zip',
      'FeedInventory_Backup_2026-01-03_00-00-00_auto.zip',
      'FeedInventory_Backup_2026-01-04_00-00-00_pre-restore.zip',
    ]
    for (const filename of filenames) fs.copyFileSync(sourcePath, path.join(destination, filename))
    await enforceRetention(destination, 1)
    const remaining = fs.readdirSync(destination)
    expect(remaining.filter((name) => name.endsWith('_auto.zip'))).toHaveLength(1)
    expect(remaining.some((name) => name.endsWith('_pre-restore.zip'))).toBe(true)
    expect(remaining.some((name) => !name.includes('_auto') && !name.includes('_pre-restore'))).toBe(true)
  })
})
