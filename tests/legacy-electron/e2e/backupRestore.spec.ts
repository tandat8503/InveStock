import { test, expect } from './fixtures/electronApp'

test('backup controls start disabled until a folder is selected', async ({ mainWindow }) => {
  await mainWindow.getByTestId('nav-settings').click()
  await expect(mainWindow.getByRole('heading', { name: 'Cài đặt' })).toBeVisible()
  await expect(mainWindow.getByRole('button', { name: 'Backup ngay' })).toBeDisabled()
  await expect(mainWindow.getByRole('button', { name: /Khôi phục từ ZIP/ })).toBeEnabled()
})
