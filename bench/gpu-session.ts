import { type Page } from '@playwright/test';
import { type AutomationApi } from '../src/app/automation';

export async function openAutomationPage(page: Page, path = '/?automation'): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => window.eventhorizonAutomation !== undefined);
}

export type AutomationMethod = keyof AutomationApi;
