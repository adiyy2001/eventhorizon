import { expect, test } from '@playwright/test';
import { runColorParityOnGpu } from '../bench/color-parity-run';
import { openAutomationPage } from '../bench/gpu-parity-run';

test.describe('GPU colour pipeline against the CPU twins', () => {
  test.beforeEach(async ({ page }) => {
    await openAutomationPage(page);
  });

  test('every colour and background function matches within its tolerance', async ({ page }) => {
    test.setTimeout(240_000);
    const result = await runColorParityOnGpu(page);
    for (const report of result.reports) {
      expect(result.shaderMessages[report.mode], report.mode).toEqual([]);
      expect(report.violations, `${report.mode} ${JSON.stringify(report)}`).toBe(0);
      expect(report.pass, report.mode).toBe(true);
    }
  });
});
