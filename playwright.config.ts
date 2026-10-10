import { defineConfig, devices } from '@playwright/test';

const port = 4320;
const origin = `http://127.0.0.1:${String(port)}`;

export const webGpuLaunchArguments = [
  '--enable-unsafe-webgpu',
  '--use-webgpu-adapter=swiftshader',
  '--use-angle=swiftshader',
  '--enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE',
];

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
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: webGpuLaunchArguments },
      },
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
