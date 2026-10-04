import { defineConfig } from 'vitest/config';

export const gpuDeviceBoundFiles = ['src/gpu/smoke-kernel.ts'];

export default defineConfig({
  test: {
    coverage: {
      exclude: gpuDeviceBoundFiles,
      thresholds: {
        'src/core/**': { lines: 90 },
        'src/app/**': { lines: 80 },
        'src/gpu/**': { lines: 80 },
      },
    },
  },
});
