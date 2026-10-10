import { chromium, type Browser } from '@playwright/test';
import { benchLaunchArguments } from './launch-arguments';

export async function launchWebGpuBrowser(): Promise<Browser> {
  const executablePath = process.env['EVENTHORIZON_CHROME'];
  return chromium.launch({
    args: benchLaunchArguments(),
    ...(executablePath === undefined ? {} : { executablePath }),
  });
}
