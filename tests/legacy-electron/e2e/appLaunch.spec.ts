import { test, expect } from './fixtures/electronApp'
import { expectDatabaseCreated } from './helpers/database'

test('launches one isolated main window with complete sidebar', async ({
  electronApp,
  mainWindow,
  userDataPath,
}) => {
  expect(electronApp.windows().length).toBe(1)
  await expect(mainWindow.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  for (const menu of [
    'dashboard', 'products', 'suppliers', 'purchases', 'sales',
    'inventory', 'invoices', 'reports', 'imports', 'settings',
  ]) {
    await expect(mainWindow.getByTestId(`nav-${menu}`)).toBeVisible()
  }
  expectDatabaseCreated(userDataPath)
})
