import { test, expect } from './fixtures/electronApp'

test('products and suppliers pages are reachable in isolated app', async ({ mainWindow }) => {
  await mainWindow.getByTestId('nav-products').click()
  await expect(mainWindow.getByRole('heading', { name: /Sản phẩm/i })).toBeVisible()
  await mainWindow.getByTestId('nav-suppliers').click()
  await expect(mainWindow.getByRole('heading', { name: /Nhà cung cấp/i })).toBeVisible()
})
