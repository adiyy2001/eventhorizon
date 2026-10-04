import { defineConfig } from 'vitest/config';

export const gpuDeviceBoundFiles = [
  'src/gpu/smoke-kernel.ts',
  'src/gpu/shader-compile.ts',
  'src/gpu/readback.ts',
  'src/gpu/renderer.ts',
  'src/gpu/gpu-timer.ts',
  'src/gpu/sky-resources.ts',
  'src/gpu/passes/accumulate-pass.ts',
  'src/gpu/passes/bake-pass.ts',
  'src/gpu/passes/bloom-pass.ts',
  'src/gpu/passes/color-parity-pass.ts',
  'src/gpu/passes/present-pass.ts',
  'src/gpu/passes/parity-pass.ts',
  'src/gpu/passes/trace-pass.ts',
];

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
