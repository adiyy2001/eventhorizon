import { chromium, type Browser } from '@playwright/test';
import { webGpuLaunchArguments } from '../playwright.config';

export async function launchWebGpuBrowser(): Promise<Browser> {
  return chromium.launch({ args: webGpuLaunchArguments });
}
