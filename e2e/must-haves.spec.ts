import { expect, type Page, test } from '@playwright/test';
import { compareEncodedImages } from '../bench/image-compare';
import { openAutomationPage, renderSettingsOnGpu } from '../bench/gpu-parity-run';
import type { MotionResponse, RenderResponse } from '../src/app/automation';
import { defaultSettings, mergeSettings } from '../src/core/render/settings';

const OUTCOME_CAPTURED = 0;
const OUTCOME_ESCAPED = 1;
const OUTCOME_DISK = 2;
const renderTimeout = 90_000;
const small = { width: 128, height: 128 };

type Change = Parameters<typeof mergeSettings>[1];

function settingsWith(change: Change) {
  return mergeSettings(defaultSettings, change);
}

async function renderSmall(page: Page, change: Change, frames = 2): Promise<RenderResponse> {
  return renderSettingsOnGpu(page, settingsWith(change), small, frames);
}

function count(response: RenderResponse, code: number): number {
  return response.outcomes.filter((outcome) => outcome === code).length;
}

function brightness(response: RenderResponse, index: number): number {
  return (
    0.2126 * (response.radiance[index * 3] ?? 0) +
    0.7152 * (response.radiance[index * 3 + 1] ?? 0) +
    0.0722 * (response.radiance[index * 3 + 2] ?? 0)
  );
}

function diskBrightnessByHalf(response: RenderResponse): { left: number; right: number } {
  let left = 0;
  let right = 0;
  response.outcomes.forEach((outcome, index) => {
    if (outcome === OUTCOME_DISK) {
      if (index % small.width < small.width / 2) {
        left += brightness(response, index);
      } else {
        right += brightness(response, index);
      }
    }
  });
  return { left, right };
}

function diskBlueToRed(response: RenderResponse): number {
  let red = 0;
  let blue = 0;
  response.outcomes.forEach((outcome, index) => {
    if (outcome === OUTCOME_DISK) {
      red += response.radiance[index * 3] ?? 0;
      blue += response.radiance[index * 3 + 2] ?? 0;
    }
  });
  return blue / red;
}

async function openInterface(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.getByTestId('viewport-canvas')).toHaveAttribute('data-state', 'rendered', {
    timeout: renderTimeout,
  });
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

test.describe('every must-have of the brief, against the production build', () => {
  test.describe.configure({ timeout: 240_000 });

  test('a WebGPU ray tracer draws the shadow, the disk and the sky', async ({ page }) => {
    await openAutomationPage(page);
    const response = await renderSmall(page, {});
    expect(response.adapter.architecture.length).toBeGreaterThan(0);
    expect(count(response, OUTCOME_CAPTURED)).toBeGreaterThan(small.width * 3);
    expect(count(response, OUTCOME_DISK)).toBeGreaterThan(small.width * 8);
    expect(count(response, OUTCOME_ESCAPED)).toBeGreaterThan(small.width * 20);
    expect(response.radiance.every((value) => Number.isFinite(value))).toBe(true);
    const centre = (small.height / 2) * small.width + small.width / 2;
    expect(response.outcomes[centre]).toBe(OUTCOME_CAPTURED);
  });

  test('light is bent: the shadow shrinks to a small body when lensing is off', async ({
    page,
  }) => {
    await openAutomationPage(page);
    const lensed = await renderSmall(page, {}, 1);
    const straight = await renderSmall(page, { view: { lensing: false } }, 1);
    expect(count(straight, OUTCOME_CAPTURED)).toBeLessThan(count(lensed, OUTCOME_CAPTURED) / 4);
  });

  test('the disk shows Doppler beaming and gravitational redshift', async ({ page }) => {
    await openAutomationPage(page);
    const full = await renderSmall(page, {});
    const noDoppler = await renderSmall(page, { view: { doppler: false } });
    const noRedshift = await renderSmall(page, { view: { gravitationalRedshift: false } });
    const beamed = diskBrightnessByHalf(full);
    const flat = diskBrightnessByHalf(noDoppler);
    expect(beamed.left / beamed.right).toBeGreaterThan(1.5);
    expect(Math.abs(flat.left / flat.right - 1)).toBeLessThan(0.05);
    expect(diskBlueToRed(noRedshift)).toBeGreaterThan(diskBlueToRed(full));
  });

  test('higher-order images are a switch of their own', async ({ page }) => {
    await openAutomationPage(page);
    const full = await renderSmall(page, { view: { inclination: (85 * Math.PI) / 180 } }, 1);
    const reduced = await renderSmall(
      page,
      { view: { inclination: (85 * Math.PI) / 180, higherOrderImages: false } },
      1,
    );
    expect(count(reduced, OUTCOME_DISK)).toBeLessThan(count(full, OUTCOME_DISK));
  });

  test('colors come from a blackbody table into an HDR chain with tone mapping', async ({
    page,
  }) => {
    await openAutomationPage(page);
    const cool = await renderSmall(page, { view: { peakTemperature: 3500 } }, 1);
    const hot = await renderSmall(page, { view: { peakTemperature: 9000 } }, 1);
    expect(diskBlueToRed(hot)).toBeGreaterThan(diskBlueToRed(cool) * 1.5);
    const peak = Math.max(...hot.radiance);
    expect(peak).toBeGreaterThan(1);
    const dim = await renderSmall(page, { exposure: -3 }, 1);
    const bright = await renderSmall(page, { exposure: 1 }, 1);
    const difference = await compareEncodedImages(page, dim.pngBase64, bright.pngBase64);
    expect(difference.mean).toBeGreaterThan(5);
  });

  test('the sky is procedural: stars and nebula, and no photograph is requested', async ({
    page,
  }) => {
    const images: string[] = [];
    page.on('response', (response) => {
      const type = response.headers()['content-type'] ?? '';
      if (/^image\/(jpeg|webp|avif)/.test(type)) {
        images.push(response.url());
      }
    });
    await openAutomationPage(page);
    const response = await renderSmall(page, { view: { inclination: (10 * Math.PI) / 180 } }, 1);
    const sky: number[] = [];
    response.outcomes.forEach((outcome, index) => {
      if (outcome === OUTCOME_ESCAPED) {
        sky.push(brightness(response, index));
      }
    });
    const mean = sky.reduce((sum, value) => sum + value, 0) / sky.length;
    expect(mean).toBeGreaterThan(0);
    expect(Math.max(...sky)).toBeGreaterThan(mean * 20);
    expect(images).toEqual([]);
  });

  test('accumulation with jitter refines a still image, dynamic resolution holds the rate', async ({
    page,
  }) => {
    await openAutomationPage(page);
    const single = await renderSmall(page, {}, 1);
    const accumulated = await renderSmall(page, {}, 6);
    expect(accumulated.frames).toBe(6);
    const difference = await compareEncodedImages(page, single.pngBase64, accumulated.pngBase64);
    expect(difference.mean).toBeGreaterThan(0.05);
    const motion: MotionResponse = await page.evaluate(
      async (payload) => {
        const automation = window.eventhorizonAutomation;
        if (automation === undefined) {
          throw new Error('automation hook is missing');
        }
        return automation.runMotion(payload);
      },
      {
        settings: defaultSettings,
        size: { width: 160, height: 160 },
        plan: { moveFrames: 24, settleFrames: 36 },
      },
    );
    const moving = motion.log.filter((entry) => entry.moving);
    expect(Math.min(...moving.map((entry) => entry.scale))).toBeLessThan(1);
    expect(motion.log[motion.log.length - 1]?.scale).toBe(1);
  });

  test('the split compares any setting with the full model', async ({ page }) => {
    await openAutomationPage(page);
    const split = await renderSmall(
      page,
      {
        view: { doppler: false },
        split: { enabled: true, position: 0.5 },
      },
      2,
    );
    const unsplit = await renderSmall(page, { view: { doppler: false } }, 2);
    const full = await renderSmall(page, {}, 2);
    const mixed = diskBrightnessByHalf(split);
    const reduced = diskBrightnessByHalf(unsplit);
    const complete = diskBrightnessByHalf(full);
    expect(Math.abs(mixed.left / reduced.left - 1)).toBeLessThan(0.05);
    expect(Math.abs(mixed.right / complete.right - 1)).toBeLessThan(0.05);
    expect(Math.abs(mixed.right / reduced.right - 1)).toBeGreaterThan(0.1);
  });

  test('the photon sphere, the ISCO and the shadow edge can be drawn', async ({ page }) => {
    await openAutomationPage(page);
    const plain = await renderSmall(page, {}, 1);
    for (const overlay of ['photonSphere', 'isco', 'shadowEdge'] as const) {
      const marked = await renderSmall(page, { overlays: { [overlay]: true } }, 1);
      const difference = await compareEncodedImages(page, plain.pngBase64, marked.pngBase64);
      expect(difference.mean, overlay).toBeGreaterThan(0.05);
    }
  });

  test('the control panel drives the image, the address, the keyboard and the export', async ({
    page,
  }) => {
    await openInterface(page);
    await setRange(page, 'inclination', 50);
    await setRange(page, 'distance', 40);
    await setRange(page, 'disk-outer-radius', 20);
    await setRange(page, 'peak-temperature', 8000);
    await setRange(page, 'exposure', -1);
    await expect
      .poll(() => page.evaluate(() => window.location.search))
      .toMatch(/inc=50.*dist=40|dist=40.*inc=50/);
    await page.getByRole('switch', { name: 'Gravitational lensing' }).uncheck();
    await expect.poll(() => page.evaluate(() => window.location.search)).toContain('off=');
    await page.reload();
    await expect(page.locator('input#inclination')).toHaveValue('50');
    await expect(page.getByRole('switch', { name: 'Gravitational lensing' })).not.toBeChecked();
    await expect(page.getByTestId('viewport-canvas')).toHaveAttribute('data-state', 'rendered', {
      timeout: renderTimeout,
    });
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.evaluate(() => window.location.search)).toContain('az=');
    const downloading = page.waitForEvent('download');
    await page.getByTestId('save-image').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('eventhorizon.png');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    const png = Buffer.concat(chunks);
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(256);
  });

  test('the physics panel shows the equations typeset by KaTeX', async ({ page }) => {
    await openInterface(page);
    await page.getByTestId('show-physics').click();
    const panel = page.getByTestId('physics-panel');
    await expect(panel).toBeVisible();
    const equations = panel.locator('app-equation');
    const total = await equations.count();
    expect(total).toBeGreaterThanOrEqual(10);
    for (let index = 0; index < total; index += 1) {
      await expect(equations.nth(index)).toHaveAttribute('data-state', 'rendered');
    }
    await expect(panel.locator('.katex')).toHaveCount(total);
    await expect(panel.locator('.katex-error')).toHaveCount(0);
  });
});
