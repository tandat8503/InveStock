import type { Page, TestInfo } from '@playwright/test'

export async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> {
  const screenshot = await page.screenshot({ fullPage: true })
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' })
}
