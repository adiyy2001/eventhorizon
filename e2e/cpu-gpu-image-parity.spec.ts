import { expect, test } from '@playwright/test';
import { compareCpuAgainstGpu } from '../bench/cpu-gpu-run';
import {
  cpuGpuEdge,
  cpuGpuMeanAbsoluteTolerance,
  cpuGpuScenarios,
} from '../bench/cpu-gpu-scenarios';
import { openAutomationPage } from '../bench/gpu-session';
import { defaultSettings, mergeSettings } from '../src/core/render/settings';

test.describe('software image against the graphics image at 128 px', () => {
  test.beforeEach(async ({ page }) => {
    await openAutomationPage(page);
  });

  for (const scenario of cpuGpuScenarios) {
    test(`${scenario.name} differs by less than the tolerance`, async ({ page }) => {
      test.setTimeout(120_000);
      const comparison = await compareCpuAgainstGpu(page, {
        edge: cpuGpuEdge,
        cpu: scenario.settings,
        gpu: scenario.settings,
      });
      expect(comparison.size).toBe(cpuGpuEdge);
      expect(comparison.mean).toBeLessThan(cpuGpuMeanAbsoluteTolerance);
    });
  }

  test('a different view is not mistaken for the graphics image', async ({ page }) => {
    test.setTimeout(120_000);
    const comparison = await compareCpuAgainstGpu(page, {
      edge: cpuGpuEdge,
      cpu: defaultSettings,
      gpu: mergeSettings(defaultSettings, { view: { inclination: (10 * Math.PI) / 180 } }),
    });
    expect(comparison.mean).toBeGreaterThan(cpuGpuMeanAbsoluteTolerance * 10);
  });
});
