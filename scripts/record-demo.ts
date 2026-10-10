import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Page } from '@playwright/test';
import { launchWebGpuBrowser } from '../bench/browser';
import { describeEnvironment } from '../bench/environment';
import { demoActions, demoFrameName, demoSpec, type DemoAction } from '../bench/demo-plan';
import { startStaticServer } from '../bench/static-server';

const framesDirectory =
  process.env['EVENTHORIZON_DEMO_FRAMES'] ?? join(tmpdir(), 'eventhorizon-demo-frames');
const port = 4325;
const renderTimeout = 120_000;

interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function canvasBox(page: Page): Promise<CanvasBox> {
  const box = await page.getByTestId('viewport-canvas').boundingBox();
  if (box === null) {
    throw new Error('the canvas has no box');
  }
  return box;
}

async function perform(page: Page, action: DemoAction): Promise<void> {
  const box = await canvasBox(page);
  const point = (fractionX: number, fractionY: number) => ({
    x: box.x + box.width * fractionX,
    y: box.y + box.height * fractionY,
  });
  switch (action.kind) {
    case 'hold':
      return;
    case 'press': {
      const { x, y } = point(action.fractionX, action.fractionY);
      await page.mouse.move(x, y);
      await page.mouse.down();
      return;
    }
    case 'move': {
      const { x, y } = point(action.fractionX, action.fractionY);
      await page.mouse.move(x, y);
      return;
    }
    case 'release':
      await page.mouse.up();
      return;
    case 'switch': {
      const control = page.getByRole('switch', { name: action.label });
      await control.evaluate((element, checked) => {
        if (element instanceof HTMLInputElement && element.checked !== checked) {
          element.click();
        }
      }, action.checked);
      return;
    }
  }
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
  await page.waitForTimeout(demoSpec.settleMilliseconds);
}

async function main(): Promise<void> {
  rmSync(framesDirectory, { recursive: true, force: true });
  mkdirSync(framesDirectory, { recursive: true });
  const externalOrigin = process.env['EVENTHORIZON_ORIGIN'];
  const server =
    externalOrigin === undefined
      ? await startStaticServer(port)
      : { origin: externalOrigin, stop: () => undefined };
  const browser = await launchWebGpuBrowser();
  try {
    const page = await browser.newPage({ viewport: demoSpec.viewport });
    const query = `?v=1&inc=${String(demoSpec.startInclinationDegrees)}`;
    await page.goto(`${server.origin}/${query}`);
    await page
      .getByTestId('viewport-canvas')
      .and(page.locator('[data-state="rendered"]'))
      .waitFor({ timeout: renderTimeout });
    await page.mouse.move(0, 0);
    const actions = demoActions();
    const started = performance.now();
    for (const [frame, action] of actions.entries()) {
      await perform(page, action);
      await settle(page);
      await page.screenshot({ path: join(framesDirectory, demoFrameName(frame)), type: 'png' });
    }
    const adapter = await page.evaluate(async () => {
      const found = await navigator.gpu.requestAdapter();
      return found === null
        ? { vendor: '', architecture: '', device: '', description: '' }
        : {
            vendor: found.info.vendor,
            architecture: found.info.architecture,
            device: found.info.device,
            description: found.info.description,
          };
    });
    const record = {
      ...describeEnvironment(browser, adapter),
      viewport: demoSpec.viewport,
      frames: actions.length,
      seconds: (performance.now() - started) / 1000,
    };
    writeFileSync(join(framesDirectory, 'capture.json'), `${JSON.stringify(record, null, 2)}\n`);
    console.log(
      `${String(actions.length)} frames in ${record.seconds.toFixed(1)} s on ${adapter.vendor} ${adapter.architecture}`,
    );
  } finally {
    await browser.close();
    server.stop();
  }
}

await main();
