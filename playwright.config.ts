import { defineConfig, devices } from '@playwright/test';
import { webGpuLaunchArguments } from './bench/launch-arguments';

const port = 4320;
const origin = `http://127.0.0.1:${String(port)}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-webgpu',
      testIgnore: /fallback.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: webGpuLaunchArguments },
      },
    },
    {
      name: 'chromium-fallback',
      testMatch: /fallback.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm exec tsx scripts/serve-dist.ts',
    url: origin,
    env: { PORT: String(port) },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
