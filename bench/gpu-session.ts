import { type Page } from '@playwright/test';

export async function openAutomationPage(page: Page, path = '/?automation'): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => window.eventhorizonAutomation !== undefined);
}
