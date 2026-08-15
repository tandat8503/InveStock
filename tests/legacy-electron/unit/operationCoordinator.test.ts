import { describe, expect, it } from 'vitest'
import { OperationCoordinator } from '../../electron/services/operationCoordinator'

describe('OperationCoordinator', () => {
  it('chặn thao tác loại trừ và luôn giải phóng khóa khi lỗi', async () => {
    const coordinator = new OperationCoordinator()
    let release = (): void => undefined
    const first = coordinator.run('backup_create', () => new Promise<void>((resolve) => { release = resolve }))
    await expect(coordinator.run('import_execute', () => Promise.resolve(undefined))).rejects.toThrow()
    release()
    await first
    await expect(coordinator.run('import_execute', () => Promise.resolve(undefined))).resolves.toBeUndefined()
  })
})
