import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  baselineDirectory,
  baselineMaxAbsoluteTolerance,
  baselineMeanAbsoluteTolerance,
  baselineSpecs,
} from '../bench/baselines';
import { openAutomationPage, renderSettingsOnGpu } from '../bench/gpu-parity-run';
import { compareEncodedImages } from '../bench/image-compare';

function baselineBase64(name: string): string {
  return readFileSync(join(baselineDirectory, `${name}.png`)).toString('base64');
}

test.describe('reviewed baseline renders', () => {
  test.beforeEach(async ({ page }) => {
    await openAutomationPage(page);
  });

  for (const spec of baselineSpecs) {
    test(`${spec.name} matches its baseline`, async ({ page }) => {
      test.setTimeout(120_000);
      const response = await renderSettingsOnGpu(
        page,
        spec.settings,
        { width: spec.size, height: spec.size },
        spec.frames,
      );
      const difference = await compareEncodedImages(
        page,
        baselineBase64(spec.name),
        response.pngBase64,
      );
      expect(difference.mean).toBeLessThan(baselineMeanAbsoluteTolerance);
      expect(difference.max).toBeLessThan(baselineMaxAbsoluteTolerance);
    });
  }

  test('a different temperature is not mistaken for the baseline', async ({ page }) => {
    test.setTimeout(120_000);
    const full = baselineSpecs.find((spec) => spec.name === 'full-model');
    const hot = baselineSpecs.find((spec) => spec.name === 'temperature-9000');
    if (full === undefined || hot === undefined) {
      throw new Error('baseline specs are missing');
    }
    const response = await renderSettingsOnGpu(
      page,
      hot.settings,
      { width: full.size, height: full.size },
      full.frames,
    );
    const difference = await compareEncodedImages(
      page,
      baselineBase64(full.name),
      response.pngBase64,
    );
    expect(difference.mean).toBeGreaterThan(baselineMeanAbsoluteTolerance * 10);
  });
});
