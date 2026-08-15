import { test, expect } from './fixtures/electronApp'

test('sales workflow page opens without production data', async ({ mainWindow }) => {
  await mainWindow.getByTestId('nav-sales').click()
  await expect(mainWindow.getByRole('heading', { name: /Xuất kho|Phiếu xuất/i })).toBeVisible()
})
