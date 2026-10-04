import { expect, test, type Page } from '@playwright/test';
import { openAutomationPage } from '../bench/gpu-parity-run';
import type {
  ExportImageResponse,
  MotionResponse,
  RenderResponse,
  SequenceResponse,
} from '../src/app/automation';
import { shadowTangentRadius } from '../src/core/physics/shadow';
import { type RenderSettings, mergeSettings, defaultSettings } from '../src/core/render/settings';
import { defaultView, viewHalfExtents } from '../src/core/render/view';

const OUTCOME_CAPTURED = 0;
const OUTCOME_DISK = 2;

interface Decoded {
  width: number;
  height: number;
  data: number[];
}

type Change = Parameters<typeof mergeSettings>[1];

function settingsWith(change: Change): RenderSettings {
  return mergeSettings(defaultSettings, change);
}

async function render(
  page: Page,
  settings: RenderSettings,
  size: { width: number; height: number },
  frames = 2,
): Promise<RenderResponse> {
  return page.evaluate(
    async (payload) => {
      const automation = window.eventhorizonAutomation;
      if (automation === undefined) {
        throw new Error('automation hook is missing');
      }
      return automation.renderView(payload);
    },
    { settings, size, frames },
  );
}

async function decode(page: Page, base64: string): Promise<Decoded> {
  return page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('no 2d context');
    }
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, data: Array.from(image.data) };
  }, base64);
}

function count(outcomes: readonly number[], code: number): number {
  return outcomes.filter((outcome) => outcome === code).length;
}

function luminance(response: RenderResponse, index: number): number {
  return (
    0.2126 * (response.radiance[index * 3] ?? 0) +
    0.7152 * (response.radiance[index * 3 + 1] ?? 0) +
    0.0722 * (response.radiance[index * 3 + 2] ?? 0)
  );
}

function diskLuminanceByHalf(
  response: RenderResponse,
  size: { width: number; height: number },
): { left: number; right: number } {
  let left = 0;
  let right = 0;
  response.outcomes.forEach((outcome, index) => {
    if (outcome !== OUTCOME_DISK) {
      return;
    }
    if (index % size.width < size.width / 2) {
      left += luminance(response, index);
    } else {
      right += luminance(response, index);
    }
  });
  return { left, right };
}

function blueToRed(
  response: RenderResponse,
  size: { width: number; height: number },
  innerFraction: number,
): number {
  const disk: { index: number; radius: number }[] = [];
  response.outcomes.forEach((outcome, index) => {
    if (outcome === OUTCOME_DISK) {
      const x = (index % size.width) - size.width / 2;
      const y = Math.floor(index / size.width) - size.height / 2;
      disk.push({ index, radius: Math.hypot(x, y) });
    }
  });
  disk.sort((first, second) => first.radius - second.radius);
  const inner = disk.slice(0, Math.max(1, Math.floor(disk.length * innerFraction)));
  let red = 0;
  let blue = 0;
  for (const { index } of inner) {
    red += response.radiance[index * 3] ?? 0;
    blue += response.radiance[index * 3 + 2] ?? 0;
  }
  return blue / red;
}

function columnMeanAbsoluteDifference(
  first: Decoded,
  second: Decoded,
  columns: (column: number) => boolean,
): number {
  let total = 0;
  let samples = 0;
  for (let row = 0; row < first.height; row += 1) {
    for (let column = 0; column < first.width; column += 1) {
      if (!columns(column)) {
        continue;
      }
      for (let channel = 0; channel < 3; channel += 1) {
        const index = (row * first.width + column) * 4 + channel;
        total += Math.abs((first.data[index] ?? 0) - (second.data[index] ?? 0));
        samples += 1;
      }
    }
  }
  return total / samples;
}

const small = { width: 128, height: 128 };

test.describe('interactive renderer', () => {
  test.beforeEach(async ({ page }) => {
    await openAutomationPage(page);
  });

  test('switching lensing off shrinks the captured region by more than four times', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const on = await render(page, settingsWith({}), small, 1);
    const off = await render(page, settingsWith({ view: { lensing: false } }), small, 1);
    const capturedOn = count(on.outcomes, OUTCOME_CAPTURED);
    const capturedOff = count(off.outcomes, OUTCOME_CAPTURED);
    expect(capturedOn).toBeGreaterThan(100);
    expect(capturedOff * 4).toBeLessThan(capturedOn);
  });

  test('the Doppler switch brightens one side of the disk and nothing else', async ({ page }) => {
    test.setTimeout(180_000);
    const on = await render(page, settingsWith({}), small, 1);
    const off = await render(page, settingsWith({ view: { doppler: false } }), small, 1);
    const onHalves = diskLuminanceByHalf(on, small);
    const offHalves = diskLuminanceByHalf(off, small);
    expect(onHalves.left / onHalves.right).toBeGreaterThan(1.5);
    expect(Math.abs(offHalves.left / offHalves.right - 1)).toBeLessThan(0.05);
  });

  test('switching gravitational redshift off turns the inner disk bluer', async ({ page }) => {
    test.setTimeout(180_000);
    const view = { doppler: false, inclination: (10 * Math.PI) / 180 };
    const on = await render(page, settingsWith({ view }), small, 1);
    const off = await render(
      page,
      settingsWith({ view: { ...view, gravitationalRedshift: false } }),
      small,
      1,
    );
    expect(blueToRed(off, small, 0.25)).toBeGreaterThan(blueToRed(on, small, 0.25) * 1.05);
  });

  test('switching higher-order images off removes disk pixels and adds none', async ({ page }) => {
    test.setTimeout(240_000);
    const size = { width: 192, height: 192 };
    const on = await render(page, settingsWith({}), size, 1);
    const off = await render(page, settingsWith({ view: { higherOrderImages: false } }), size, 1);
    let extra = 0;
    let added = 0;
    on.outcomes.forEach((outcome, index) => {
      const offOutcome = off.outcomes[index];
      if (outcome === OUTCOME_DISK && offOutcome !== OUTCOME_DISK) {
        extra += 1;
      }
      if (outcome !== OUTCOME_DISK && offOutcome === OUTCOME_DISK) {
        added += 1;
      }
    });
    expect(added).toBe(0);
    expect(extra).toBeGreaterThan(0);
  });

  test('the shadow edge overlay sits on the analytic radius and on the captured area', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const size = { width: 256, height: 256 };
    const view = { inclination: (10 * Math.PI) / 180 };
    const plain = await render(page, settingsWith({ view }), size, 1);
    const marked = await render(
      page,
      settingsWith({ view, overlays: { shadowEdge: true } }),
      size,
      1,
    );
    const plainImage = await decode(page, plain.pngBase64);
    const markedImage = await decode(page, marked.pngBase64);
    let weight = 0;
    let weightedRadius = 0;
    for (let row = 0; row < size.height; row += 1) {
      for (let column = 0; column < size.width; column += 1) {
        const index = (row * size.width + column) * 4;
        let difference = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          difference += Math.abs(
            (markedImage.data[index + channel] ?? 0) - (plainImage.data[index + channel] ?? 0),
          );
        }
        weight += difference;
        weightedRadius +=
          difference * Math.hypot(column + 0.5 - size.width / 2, row + 0.5 - size.height / 2);
      }
    }
    const measured = weightedRadius / weight;
    const { halfHeight } = viewHalfExtents({ ...defaultView, ...view }, size);
    const analytic = (shadowTangentRadius(defaultView.distance) / halfHeight) * (size.height / 2);
    expect(Math.abs(measured / analytic - 1)).toBeLessThan(0.01);
    const capturedRadius = Math.sqrt(count(plain.outcomes, OUTCOME_CAPTURED) / Math.PI);
    expect(Math.abs(measured / capturedRadius - 1)).toBeLessThan(0.01);
  });

  test('split compare shows the selected switches on the left and the full model on the right', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const split = { enabled: true, position: 0.5 };
    const view = { doppler: false };
    const compared = await render(page, settingsWith({ view, split }), small, 1);
    const reducedOnly = await render(page, settingsWith({ view }), small, 1);
    const fullOnly = await render(page, settingsWith({}), small, 1);
    const [comparedImage, reducedImage, fullImage] = await Promise.all([
      decode(page, compared.pngBase64),
      decode(page, reducedOnly.pngBase64),
      decode(page, fullOnly.pngBase64),
    ]);
    const margin = 24;
    const leftColumns = (column: number): boolean => column < small.width / 2 - margin;
    const rightColumns = (column: number): boolean => column > small.width / 2 + margin;
    expect(columnMeanAbsoluteDifference(comparedImage, reducedImage, leftColumns)).toBeLessThan(
      0.5,
    );
    expect(columnMeanAbsoluteDifference(comparedImage, fullImage, rightColumns)).toBeLessThan(0.5);
    expect(columnMeanAbsoluteDifference(reducedImage, fullImage, leftColumns)).toBeGreaterThan(2);
  });

  test('accumulation after a setting change equals a fresh render', async ({ page }) => {
    test.setTimeout(240_000);
    const first = settingsWith({});
    const second = settingsWith({ view: { azimuth: 0.4 }, exposure: 0.5 });
    const sequence: SequenceResponse = await page.evaluate(
      async (payload) => {
        const automation = window.eventhorizonAutomation;
        if (automation === undefined) {
          throw new Error('automation hook is missing');
        }
        return automation.renderSequence(payload);
      },
      {
        size: small,
        steps: [
          { settings: first, frames: 2 },
          { settings: second, frames: 2 },
        ],
      },
    );
    const fresh = await render(page, second, small, 2);
    expect(sequence.stepFrames[1]).toBe(2);
    expect(sequence.radiance).toEqual(fresh.radiance);
    expect(sequence.pngBase64).toBe(fresh.pngBase64);
  });

  test('export produces a PNG of exactly the requested size', async ({ page }) => {
    test.setTimeout(180_000);
    const exported: ExportImageResponse = await page.evaluate(
      async (payload) => {
        const automation = window.eventhorizonAutomation;
        if (automation === undefined) {
          throw new Error('automation hook is missing');
        }
        return automation.exportImage(payload);
      },
      {
        settings: settingsWith({ overlays: { photonSphere: true } }),
        width: 200,
        height: 120,
        frames: 1,
      },
    );
    const image = await decode(page, exported.pngBase64);
    expect(exported.width).toBe(200);
    expect(exported.height).toBe(120);
    expect(image.width).toBe(200);
    expect(image.height).toBe(120);
  });

  test('automation captures with overlays and split are repeatable', async ({ page }) => {
    test.setTimeout(240_000);
    const settings = settingsWith({
      overlays: { photonSphere: true, isco: true, shadowEdge: true },
      split: { enabled: true, position: 0.4 },
      view: { doppler: false },
    });
    const first = await render(page, settings, small, 2);
    const second = await render(page, settings, small, 2);
    expect(second.pngBase64).toBe(first.pngBase64);
    expect(second.radiance).toEqual(first.radiance);
  });

  test('the controller lowers the scale while moving and restores it at rest', async ({ page }) => {
    test.setTimeout(240_000);
    const motion: MotionResponse = await page.evaluate(
      async (payload) => {
        const automation = window.eventhorizonAutomation;
        if (automation === undefined) {
          throw new Error('automation hook is missing');
        }
        return automation.runMotion(payload);
      },
      {
        settings: settingsWith({}),
        size: { width: 192, height: 192 },
        plan: { moveFrames: 30, settleFrames: 40 },
      },
    );
    const moving = motion.log.filter((entry) => entry.moving);
    expect(moving.length).toBeGreaterThan(0);
    expect(Math.min(...moving.map((entry) => entry.scale))).toBeLessThan(1);
    expect(motion.log[motion.log.length - 1]?.scale).toBe(1);
  });
});
