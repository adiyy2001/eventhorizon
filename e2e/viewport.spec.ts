import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const artifactDirectory = join('test-results', 'viewport');

interface CanvasStatistics {
  width: number;
  centerLuma: number;
  litFraction: number;
  distinctLevels: number;
}

test('the shell draws the first lensed frame on its canvas', async ({ page }) => {
  mkdirSync(artifactDirectory, { recursive: true });
  await page.goto('/');
  const canvas = page.getByTestId('viewport-canvas');
  await expect(canvas).toHaveAttribute('data-state', 'rendered', { timeout: 60_000 });
  const screenshot = await canvas.screenshot({ path: join(artifactDirectory, 'shell-canvas.png') });

  const statistics = await page.evaluate(async (encoded): Promise<CanvasStatistics> => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const surface = document.createElement('canvas');
    surface.width = image.width;
    surface.height = image.height;
    const context = surface.getContext('2d');
    if (context === null) {
      throw new Error('no 2d context');
    }
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const levels = new Set<number>();
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) {
      const luma = Math.round(
        ((data[index] ?? 0) + (data[index + 1] ?? 0) + (data[index + 2] ?? 0)) / 3,
      );
      levels.add(luma >> 3);
      if (luma > 8) {
        lit += 1;
      }
    }
    const center = (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * 4;
    return {
      width: image.width,
      centerLuma: ((data[center] ?? 0) + (data[center + 1] ?? 0) + (data[center + 2] ?? 0)) / 3,
      litFraction: lit / (data.length / 4),
      distinctLevels: levels.size,
    };
  }, screenshot.toString('base64'));

  expect(statistics.width).toBeGreaterThan(300);
  expect(statistics.centerLuma).toBeLessThan(8);
  expect(statistics.litFraction).toBeGreaterThan(0.25);
  expect(statistics.litFraction).toBeLessThan(0.98);
  expect(statistics.distinctLevels).toBeGreaterThan(10);
});
