import { test, expect } from './fixtures/electronApp'

test('import wizard and history start in safe empty state', async ({ mainWindow }) => {
  await mainWindow.getByTestId('nav-imports').click()
  await expect(mainWindow.getByRole('heading', { name: 'Import dữ liệu' })).toBeVisible()
  await expect(mainWindow.getByText('Chưa có lịch sử import.')).toBeVisible()
  await expect(mainWindow.getByRole('button', { name: /Chọn file/ })).toBeVisible()
})
