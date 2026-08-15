import { test, expect } from './fixtures/electronApp'

test('purchase workflow page opens without production data', async ({ mainWindow }) => {
  await mainWindow.getByTestId('nav-purchases').click()
  await expect(mainWindow.getByRole('heading', { name: 'Nhập kho', exact: true })).toBeVisible()
})
