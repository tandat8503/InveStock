import { test, expect } from './fixtures/electronApp'

test('reports and invoice search pages render', async ({ mainWindow }) => {
  await mainWindow.getByTestId('nav-reports').click()
  await expect(mainWindow.getByRole('heading', { name: /Báo cáo/i })).toBeVisible()
  await mainWindow.getByTestId('nav-invoices').click()
  await expect(mainWindow.getByRole('heading', { name: /Hóa đơn/i })).toBeVisible()
})
