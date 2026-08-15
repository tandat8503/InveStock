import { vi } from 'vitest'

// Mock electron app before importing connection
vi.mock('electron', () => ({
  app: {
    getPath: () => 'mock-userData-path',
  },
}))

import { initializeTestDb, closeDb } from '../../electron/db/connection'

export function setupTestDb() {
  return initializeTestDb()
}

export function teardownTestDb() {
  closeDb()
}
