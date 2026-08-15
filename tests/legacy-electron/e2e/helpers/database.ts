import fs from 'fs'
import path from 'path'

export function databasePath(userDataPath: string): string {
  return path.join(userDataPath, 'feed-inventory.db')
}

export function expectDatabaseCreated(userDataPath: string): void {
  const filePath = databasePath(userDataPath)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error(`E2E database was not created: ${filePath}`)
  }
}
