import { expect, test } from '@playwright/test';
import { previewSpec } from '../bench/preview-orbit';

const bannerTimeout = 60_000;
const finalImageTimeout = 180_000;

test('without WebGPU a progressive CPU render and a recorded video appear', async ({
  page,
  request,
}) => {
  test.setTimeout(finalImageTimeout + 60_000);
  await page.goto('/');
  await expect(page.getByTestId('fallback-banner')).toBeVisible({ timeout: bannerTimeout });
  const canvas = page.getByTestId('viewport-canvas');
  await expect(canvas).toHaveAttribute('data-backend', 'cpu');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-passes-done')), {
      timeout: bannerTimeout,
    })
    .toBeGreaterThanOrEqual(1);
  await expect(canvas).toHaveAttribute('data-complete', 'true', { timeout: finalImageTimeout });
  expect(Number(await canvas.getAttribute('data-passes-done'))).toBe(
    Number(await canvas.getAttribute('data-passes-total')),
  );
  const video = page.getByTestId('preview-video');
  await expect(video.locator('source')).toHaveAttribute('src', 'media/preview.webm');
  const media = await request.get('media/preview.webm');
  expect(media.ok()).toBe(true);
  expect((await media.body()).length).toBeLessThanOrEqual(previewSpec.maxBytes);
});
