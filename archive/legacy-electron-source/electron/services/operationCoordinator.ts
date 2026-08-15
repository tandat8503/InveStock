export type DataOperation = 'import_execute' | 'backup_create' | 'backup_restore' | 'database_migration'

export class OperationCoordinator {
  private active: DataOperation | null = null

  get activeOperation(): DataOperation | null { return this.active }

  async run<T>(operation: DataOperation, task: () => Promise<T>): Promise<T> {
    if (this.active) throw new Error('Một tác vụ dữ liệu khác đang được thực hiện. Vui lòng chờ.')
    this.active = operation
    try {
      return await task()
    } finally {
      this.active = null
    }
  }
}

export const operationCoordinator = new OperationCoordinator()
