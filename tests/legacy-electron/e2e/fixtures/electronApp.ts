import fs from 'fs'
import os from 'os'
import path from 'path'
import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test'

interface ElectronFixtures {
  electronApp: ElectronApplication
  mainWindow: Page
  userDataPath: string
}

export const test = base.extend<ElectronFixtures>({
  userDataPath: async ({ playwright: _playwright }, use) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-inventory-e2e-'))
    await use(directory)
    fs.rmSync(directory, { recursive: true, force: true })
  },
  electronApp: async ({ userDataPath }, use) => {
    const environment = { ...process.env, FEED_INVENTORY_USER_DATA: userDataPath }
    delete environment['ELECTRON_RUN_AS_NODE']
    const application = await _electron.launch({
      args: [path.resolve('out/main/main.js')],
      env: environment,
    })
    await use(application)
    await application.close()
  },
  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await use(window)
  },
})

export { expect } from '@playwright/test'
