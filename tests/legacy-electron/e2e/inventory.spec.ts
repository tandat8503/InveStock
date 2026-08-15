import { test, expect } from './fixtures/electronApp'

test('inventory page renders summary and ledger tabs', async ({ mainWindow }) => {
  await mainWindow.getByTestId('nav-inventory').click()
  await expect(mainWindow.getByRole('heading', { name: /Tồn kho/i })).toBeVisible()
})
