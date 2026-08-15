import { describe, expect, it, vi } from 'vitest'
import type { AppSettingsDTO } from '../../shared/ipc-types'
import {
  runAutoBackupIfNeeded,
  type AutoBackupDependencies,
} from '../../electron/services/autoBackupService'

function settings(overrides: Partial<AppSettingsDTO> = {}): AppSettingsDTO {
  return {
    storeName: 'Store',
    taxCode: '',
    address: '',
    phone: '',
    currency: 'VND',
    backupFolder: '/backup',
    automaticBackupEnabled: true,
    backupRetentionCount: 10,
    lastSuccessfulBackupDate: '',
    lastBackupFile: '',
    lastBackupError: '',
    ...overrides,
  }
}

function dependencies(initial: AppSettingsDTO): {
  deps: AutoBackupDependencies
  current: () => AppSettingsDTO
  create: AutoBackupDependencies['create']
  retain: AutoBackupDependencies['retain']
} {
  let current = initial
  const create = vi.fn(() => Promise.resolve({
    success: true,
    filePath: '/backup/FeedInventory_Backup_auto.zip',
    createdAt: '2026-07-27T01:00:00.000Z',
  }))
  const retain = vi.fn(() => Promise.resolve())
  return {
    deps: {
      settings: {
        getAll: () => Promise.resolve(current),
        updateAll: (changes) => {
          current = { ...current, ...changes }
          return Promise.resolve(current)
        },
      },
      create,
      retain,
      ensureWritable: () => undefined,
    },
    current: () => current,
    create,
    retain,
  }
}

describe('Phase 6 auto backup', () => {
  it('disabled hoặc folder rỗng không chạy', async () => {
    const disabled = dependencies(settings({ automaticBackupEnabled: false }))
    expect(await runAutoBackupIfNeeded(new Date('2026-07-27'), disabled.deps)).toBe(false)
    expect(disabled.create).not.toHaveBeenCalled()
    const empty = dependencies(settings({ backupFolder: '' }))
    expect(await runAutoBackupIfNeeded(new Date('2026-07-27'), empty.deps)).toBe(false)
  })

  it('chạy một lần mỗi ngày, sang ngày mới chạy lại và cập nhật trạng thái', async () => {
    const fixture = dependencies(settings())
    expect(await runAutoBackupIfNeeded(new Date('2026-07-27'), fixture.deps)).toBe(true)
    expect(fixture.current().lastSuccessfulBackupDate).toBe('2026-07-27T01:00:00.000Z')
    expect(fixture.current().lastBackupFile).toContain('FeedInventory')
    expect(fixture.retain).toHaveBeenCalledWith('/backup', 10)
    expect(await runAutoBackupIfNeeded(new Date('2026-07-27T12:00:00Z'), fixture.deps)).toBe(false)
    fixture.deps.create = () => Promise.resolve({
      success: true,
      filePath: '/backup/new.zip',
      createdAt: '2026-07-28T01:00:00.000Z',
    })
    expect(await runAutoBackupIfNeeded(new Date('2026-07-28'), fixture.deps)).toBe(true)
  })

  it('folder không ghi được không crash và lưu lastBackupError', async () => {
    const fixture = dependencies(settings())
    fixture.deps.ensureWritable = () => { throw new Error('permission denied') }
    await expect(runAutoBackupIfNeeded(new Date('2026-07-27'), fixture.deps)).resolves.toBe(false)
    expect(fixture.current().lastBackupError).toBe('permission denied')
  })

  it('retention nhận count=1 và count lớn hơn số file mà không đổi loại backup', async () => {
    const one = dependencies(settings({ backupRetentionCount: 1 }))
    await runAutoBackupIfNeeded(new Date('2026-07-27'), one.deps)
    expect(one.retain).toHaveBeenCalledWith('/backup', 1)
    const many = dependencies(settings({ backupRetentionCount: 100 }))
    await runAutoBackupIfNeeded(new Date('2026-07-27'), many.deps)
    expect(many.retain).toHaveBeenCalledWith('/backup', 100)
  })
})
