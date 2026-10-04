import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  baselineDirectory,
  baselineMeanAbsoluteTolerance,
  baselineSpecs,
} from '../bench/baselines';
import { openAutomationPage, renderOnGpu } from '../bench/gpu-parity-run';
import { defaultPost } from '../src/core/render/post';

async function meanAbsoluteDifference(
  page: Page,
  firstBase64: string,
  secondBase64: string,
): Promise<number> {
  return page.evaluate(
    async ({ first, second }) => {
      async function pixels(base64: string): Promise<Uint8ClampedArray> {
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        if (context === null) {
          throw new Error('no 2d context');
        }
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      }
      const left = await pixels(first);
      const right = await pixels(second);
      if (left.length !== right.length) {
        return Number.POSITIVE_INFINITY;
      }
      let total = 0;
      let count = 0;
      for (let index = 0; index < left.length; index += 1) {
        if (index % 4 !== 3) {
          total += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
          count += 1;
        }
      }
      return total / count;
    },
    { first: firstBase64, second: secondBase64 },
  );
}

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
