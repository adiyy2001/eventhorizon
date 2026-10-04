import { expect, test, type Page } from '@playwright/test';
import { openAutomationPage } from '../bench/gpu-parity-run';
import type { RenderResponse } from '../src/app/automation';
import { defaultPost, type PostSettings } from '../src/core/render/post';
import { defaultView } from '../src/core/render/view';

const size = { width: 96, height: 96 };

async function render(
  page: Page,
  frames: number,
  post: PostSettings = defaultPost,
): Promise<RenderResponse> {
  return page.evaluate(
    async (payload) => {
      const automation = window.eventhorizonAutomation;
      if (automation === undefined) {
        throw new Error('automation hook is missing');
      }
      return automation.renderView(payload);
    },
    { view: defaultView, size, frames, post },
  );
}

function luminances(radiance: readonly number[]): number[] {
  const values: number[] = [];
  for (let index = 0; index < radiance.length; index += 3) {
    values.push(
      0.2126 * (radiance[index] ?? 0) +
        0.7152 * (radiance[index + 1] ?? 0) +
        0.0722 * (radiance[index + 2] ?? 0),
    );
  }
  return values;
}

test.describe('HDR chain', () => {
  test.beforeEach(async ({ page }) => {
    await openAutomationPage(page);
  });

  test('the accumulated radiance is finite, non-negative and spans many decades', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const response = await render(page, 3);
    expect(response.radiance.length).toBe(size.width * size.height * 3);
    expect(response.radiance.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    const values = luminances(response.radiance).filter((value) => value > 0);
    expect(values.length).toBeGreaterThan(size.width * size.height * 0.9);
    const sorted = [...values].sort((left, right) => left - right);
    const low = sorted[Math.floor(sorted.length * 0.02)] ?? 0;
    const high = sorted[Math.floor(sorted.length * 0.98)] ?? 0;
    expect(high / low).toBeGreaterThan(50);
  });

  test('rendering is deterministic for identical inputs', async ({ page }) => {
    test.setTimeout(120_000);
    const first = await render(page, 2);
    const second = await render(page, 2);
    expect(second.radiance).toEqual(first.radiance);
    expect(second.pngBase64).toBe(first.pngBase64);
  });

  test('more frames converge towards the same mean radiance', async ({ page }) => {
    test.setTimeout(180_000);
    const few = await render(page, 2);
    const many = await render(page, 8);
    const mean = (response: RenderResponse): number =>
      luminances(response.radiance).reduce((total, value) => total + value, 0) /
      (size.width * size.height);
    expect(Math.abs(mean(many) - mean(few)) / mean(many)).toBeLessThan(0.05);
    expect(many.frames).toBe(8);
  });

  test('exposure scales the displayed image without touching the radiance', async ({ page }) => {
    test.setTimeout(120_000);
    const base = await render(page, 1);
    const brighter = await render(page, 1, { ...defaultPost, exposure: 2 });
    expect(brighter.radiance).toEqual(base.radiance);
    expect(brighter.pngBase64).not.toBe(base.pngBase64);
  });

  test('bloom changes the picture and leaves the radiance alone', async ({ page }) => {
    test.setTimeout(120_000);
    const without = await render(page, 1, { ...defaultPost, bloomStrength: 0 });
    const withBloom = await render(page, 1, { ...defaultPost, bloomStrength: 0.5 });
    expect(withBloom.radiance).toEqual(without.radiance);
    expect(withBloom.pngBase64).not.toBe(without.pngBase64);
  });
});
