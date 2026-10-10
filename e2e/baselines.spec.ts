import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  baselineDirectory,
  baselineMeanAbsoluteTolerance,
  baselineSpecs,
} from '../bench/baselines';
import { openAutomationPage, renderOnGpu } from '../bench/gpu-parity-run';
import { meanAbsoluteDifference } from '../bench/image-compare';
import { defaultPost } from '../src/core/render/post';

test.describe('reviewed baseline renders', () => {
  test.beforeEach(async ({ page }) => {
    await openAutomationPage(page);
  });

  for (const spec of baselineSpecs) {
    test(`${spec.name} matches its baseline`, async ({ page }) => {
      test.setTimeout(120_000);
      const response = await page.evaluate(
        async (payload) => {
          const automation = window.eventhorizonAutomation;
          if (automation === undefined) {
            throw new Error('automation hook is missing');
          }
          return automation.renderView(payload);
        },
        {
          view: spec.view,
          size: { width: spec.size, height: spec.size },
          frames: spec.frames,
          post: defaultPost,
        },
      );
      const baseline = readFileSync(join(baselineDirectory, `${spec.name}.png`)).toString('base64');
      const difference = await meanAbsoluteDifference(page, baseline, response.pngBase64);
      expect(difference).toBeLessThan(baselineMeanAbsoluteTolerance);
    });
  }

  test('a different temperature is not mistaken for the baseline', async ({ page }) => {
    test.setTimeout(120_000);
    const spec = baselineSpecs[3];
    const other = baselineSpecs[5];
    if (spec === undefined || other === undefined) {
      throw new Error('baseline specs are missing');
    }
    const response = await renderOnGpu(page, other.view, { width: spec.size, height: spec.size });
    const baseline = readFileSync(join(baselineDirectory, `${spec.name}.png`)).toString('base64');
    const difference = await meanAbsoluteDifference(page, baseline, response.pngBase64);
    expect(difference).toBeGreaterThan(baselineMeanAbsoluteTolerance * 10);
  });
});
