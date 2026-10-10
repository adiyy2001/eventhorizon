import { expect, type Page, test } from '@playwright/test';
import { compareEncodedImages } from '../bench/image-compare';
import { openAutomationPage } from '../bench/gpu-session';
import { decodeSettings } from '../src/core/render/url-codec';
import { poolSize } from '../src/core/render/tile-scheduler';

interface RenderLogEntry {
  generation: string | null;
  complete: string | null;
}

declare global {
  interface Window {
    renderLog?: RenderLogEntry[];
  }
}

const noAdapterMessage = 'WebGPU is present but no graphics adapter is available.';
const firstImageTimeout = 60_000;
const finalImageTimeout = 180_000;
const displaySize = 512;

function canvasOf(page: Page) {
  return page.getByTestId('viewport-canvas');
}

async function attribute(page: Page, name: string): Promise<string | null> {
  return canvasOf(page).getAttribute(name);
}

async function waitForFinalImage(page: Page): Promise<void> {
  await expect(canvasOf(page)).toHaveAttribute('data-complete', 'true', {
    timeout: finalImageTimeout,
  });
}

async function waitForFirstPass(page: Page): Promise<void> {
  await expect
    .poll(async () => Number(await attribute(page, 'data-passes-done')), {
      timeout: firstImageTimeout,
    })
    .toBeGreaterThanOrEqual(1);
}

interface CanvasStatistics {
  hash: string;
  litFraction: number;
  columnLuma: number[];
}

async function canvasStatistics(page: Page, column = 0): Promise<CanvasStatistics> {
  return canvasOf(page).evaluate((element, probeColumn) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error('the viewport canvas is missing');
    }
    const context = element.getContext('2d');
    if (context === null) {
      throw new Error('no 2d context');
    }
    const { data } = context.getImageData(0, 0, element.width, element.height);
    let hash = 2166136261;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      hash = Math.imul(hash ^ red, 16777619) >>> 0;
      hash = Math.imul(hash ^ green, 16777619) >>> 0;
      hash = Math.imul(hash ^ blue, 16777619) >>> 0;
      if (red + green + blue > 24) {
        lit += 1;
      }
    }
    const columnLuma: number[] = [];
    for (let row = 0; row < element.height; row += 1) {
      const offset = (row * element.width + probeColumn) * 4;
      columnLuma.push(
        ((data[offset] ?? 0) + (data[offset + 1] ?? 0) + (data[offset + 2] ?? 0)) / 3,
      );
    }
    return { hash: hash.toString(16), litFraction: lit / (data.length / 4), columnLuma };
  }, column);
}

async function canvasPngBase64(page: Page): Promise<string> {
  const url = await canvasOf(page).evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error('the viewport canvas is missing');
    }
    return element.toDataURL('image/png');
  });
  return url.slice(url.indexOf(',') + 1);
}

async function setRange(page: Page, id: string, value: number): Promise<void> {
  await page.locator(`input#${id}`).evaluate((element, next) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error('not a range input');
    }
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function useOneWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
  });
}

async function logRenderStates(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: RenderLogEntry[] = [];
    window.renderLog = log;
    new MutationObserver(() => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]');
      if (canvas !== null) {
        log.push({
          generation: canvas.getAttribute('data-generation'),
          complete: canvas.getAttribute('data-complete'),
        });
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-generation', 'data-complete'],
    });
  });
}

async function renderLog(page: Page): Promise<RenderLogEntry[]> {
  return page.evaluate(() => window.renderLog ?? []);
}

test.describe('without a WebGPU adapter', () => {
  test('falls back to software rendering and says why', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByTestId('fallback-banner');
    await expect(banner).toBeVisible({ timeout: firstImageTimeout });
    await expect(page.getByTestId('gpu-status')).toHaveText(noAdapterMessage);
    await expect(page.getByTestId('fallback-detail')).toContainText('requestAdapter returned null');
    await expect(canvasOf(page)).toHaveAttribute('data-backend', 'cpu');
    await expect(page.getByRole('heading', { name: 'Software rendering' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Graphics check' })).toHaveCount(0);
    const cores = await page.evaluate(() => navigator.hardwareConcurrency);
    await expect(page.getByTestId('fallback-explanation')).toContainText(
      `${String(poolSize(cores))} background`,
    );
    await expect(page.getByTestId('show-controls')).toBeVisible();
    await expect(page.getByTestId('show-physics')).toBeVisible();
  });

  test('says the browser has no WebGPU when the interface is missing altogether', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    });
    await page.goto('/');
    await expect(page.getByTestId('gpu-status')).toHaveText(
      'This browser does not expose WebGPU.',
      { timeout: firstImageTimeout },
    );
    await expect(page.getByTestId('fallback-detail')).toContainText(
      'navigator.gpu is not available',
    );
    await expect(canvasOf(page)).toHaveAttribute('data-backend', 'cpu');
    await waitForFinalImage(page);
  });

  test('draws a coarse image first and sharpens it in passes to the final image', async ({
    page,
  }) => {
    test.setTimeout(finalImageTimeout + 60_000);
    await useOneWorker(page);
    await page.goto('/');
    await waitForFirstPass(page);
    expect(await attribute(page, 'data-complete')).toBe('false');
    expect(await attribute(page, 'data-passes-total')).toBe('4');
    const coarse = await canvasStatistics(page);
    expect(coarse.litFraction).toBeGreaterThan(0.3);
    await waitForFinalImage(page);
    expect(await attribute(page, 'data-passes-done')).toBe('4');
    const final = await canvasStatistics(page);
    expect(final.hash).not.toBe(coarse.hash);
    expect(final.litFraction).toBeGreaterThan(0.3);
    const first = Number(await attribute(page, 'data-first-image-ms'));
    const full = Number(await attribute(page, 'data-full-image-ms'));
    expect(first).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(first);
    await expect(page.getByTestId('render-progress-text')).toContainText('Full resolution after');
  });

  test('a change of setting cancels the running render and the final image has the new setting', async ({
    page,
    context,
  }) => {
    test.setTimeout(finalImageTimeout + 120_000);
    await useOneWorker(page);
    await logRenderStates(page);
    await page.goto('/');
    await waitForFirstPass(page);
    expect(await attribute(page, 'data-generation')).toBe('1');
    expect(await attribute(page, 'data-complete')).toBe('false');

    await page.keyboard.press('ArrowRight');
    await expect(canvasOf(page)).toHaveAttribute('data-generation', '2');
    await waitForFinalImage(page);
    expect(await attribute(page, 'data-generation')).toBe('2');

    const log = await renderLog(page);
    expect(log.some((entry) => entry.generation === '1' && entry.complete === 'true')).toBe(false);
    expect(log.some((entry) => entry.generation === '2' && entry.complete === 'true')).toBe(true);

    await expect.poll(() => page.evaluate(() => window.location.search)).toContain('az=');
    const settings = decodeSettings(await page.evaluate(() => window.location.search));
    const reference = await context.newPage();
    await openAutomationPage(reference);
    const expected = await reference.evaluate(
      async (payload) => {
        const automation = window.eventhorizonAutomation;
        if (automation === undefined) {
          throw new Error('automation hook is missing');
        }
        return automation.renderCpuView(payload);
      },
      { size: { width: displaySize, height: displaySize }, settings, workers: 8 },
    );
    const difference = await compareEncodedImages(
      reference,
      await canvasPngBase64(page),
      expected.pngBase64,
    );
    expect(difference.max).toBe(0);
  });

  test('exposure, bloom and overlays redisplay the picture without tracing it again', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForFinalImage(page);
    const generation = await attribute(page, 'data-generation');
    const settled = await canvasStatistics(page);

    await setRange(page, 'exposure', 1.5);
    await expect.poll(async () => (await canvasStatistics(page)).hash).not.toBe(settled.hash);
    const brighter = await canvasStatistics(page);

    await setRange(page, 'bloom', 0.3);
    await expect.poll(async () => (await canvasStatistics(page)).hash).not.toBe(brighter.hash);
    const glowing = await canvasStatistics(page);

    await page.getByRole('switch', { name: 'Shadow edge' }).check();
    await expect.poll(async () => (await canvasStatistics(page)).hash).not.toBe(glowing.hash);

    expect(await attribute(page, 'data-generation')).toBe(generation);
    await waitForFinalImage(page);
  });

  test('the camera and the physics switches trace a new picture', async ({ page }) => {
    await page.goto('/');
    await waitForFinalImage(page);
    const before = await canvasStatistics(page);

    await page.getByRole('switch', { name: 'Gravitational lensing' }).uncheck();
    await expect(canvasOf(page)).toHaveAttribute('data-generation', '2');
    await waitForFinalImage(page);
    const withoutLensing = await canvasStatistics(page);
    expect(withoutLensing.hash).not.toBe(before.hash);
    await expect.poll(() => page.evaluate(() => window.location.search)).toMatch(/off=l/);

    await setRange(page, 'inclination', 40);
    await expect(canvasOf(page)).toHaveAttribute('data-generation', '3');
    await waitForFinalImage(page);
    await expect.poll(() => page.evaluate(() => window.location.search)).toContain('inc=40');
  });

  test('a reload restores the settings from the address and draws them in software', async ({
    page,
  }) => {
    await page.goto('/?v=1&inc=40&off=l');
    await expect(page.locator('input#inclination')).toHaveValue('40');
    await expect(page.getByRole('switch', { name: 'Gravitational lensing' })).not.toBeChecked();
    await expect(canvasOf(page)).toHaveAttribute('aria-label', /Inclination 40 degrees/);
    await waitForFinalImage(page);
    expect(await attribute(page, 'data-generation')).toBe('1');
  });

  test('turns the overlays that need the graphics path off and explains it', async ({ page }) => {
    await page.goto('/?v=1&ov=pie');
    await expect(canvasOf(page)).toHaveAttribute('data-backend', 'cpu');
    for (const name of ['Photon sphere', 'Innermost stable orbit']) {
      const toggle = page.getByRole('switch', { name });
      await expect(toggle).toBeDisabled();
      await expect(toggle).not.toBeChecked();
      await expect(toggle).toHaveAccessibleDescription(/Needs WebGPU/);
    }
    const shadowEdge = page.getByRole('switch', { name: 'Shadow edge' });
    await expect(shadowEdge).toBeEnabled();
    await expect(shadowEdge).toBeChecked();
    await expect(page.getByTestId('overlay-legend')).toContainText('Shadow edge');
    await expect(page.getByTestId('overlay-legend')).not.toContainText('Photon sphere');
    await waitForFinalImage(page);
    expect(await page.evaluate(() => window.location.search)).toContain('ov=');
  });

  test('draws the split comparison divider', async ({ page }) => {
    await page.goto('/');
    await waitForFinalImage(page);
    await page.getByRole('switch', { name: 'Compare with the full model' }).check();
    await expect(canvasOf(page)).toHaveAttribute('data-generation', '2');
    await waitForFinalImage(page);
    const dividerColumn = displaySize / 2;
    const { columnLuma } = await canvasStatistics(page, dividerColumn);
    const bright = columnLuma.filter((luma) => luma > 230).length;
    expect(bright).toBeGreaterThan(displaySize * 0.8);
  });
});
