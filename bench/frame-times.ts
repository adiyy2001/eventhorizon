import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Page } from '@playwright/test';
import { type MotionResponse } from '../src/app/automation';
import { defaultSettings } from '../src/core/render/settings';
import { launchWebGpuBrowser } from './browser';
import { adapterFileName, describeEnvironment } from './environment';
import { motionStatistics } from './frame-statistics';
import { openAutomationPage } from './gpu-session';
import { startStaticServer } from './static-server';

const viewport = { width: 1920, height: 1080 };
const movingFrames = Number(process.env['BENCH_MOVING_FRAMES'] ?? '10');
const plan = { restFrames: 3, moveFrames: movingFrames, settleFrames: 3 };

async function runMotion(page: Page, dynamicResolution: boolean): Promise<MotionResponse> {
  return page.evaluate(
    async (payload) => {
      const automation = window.eventhorizonAutomation;
      if (automation === undefined) {
        throw new Error('automation hook is missing');
      }
      return automation.runMotion(payload);
    },
    { settings: defaultSettings, size: viewport, plan, dynamicResolution },
  );
}

const server = await startStaticServer(4325);
const browser = await launchWebGpuBrowser();
try {
  const page = await browser.newPage();
  await openAutomationPage(page, `${server.origin}/?automation`);
  const withScaling = await runMotion(page, true);
  const withoutScaling = await runMotion(page, false);
  const environment = describeEnvironment(browser, withScaling.adapter);
  const result = {
    ...environment,
    viewport,
    plan,
    timestampQuery: withScaling.timestampQuery,
    dynamicResolutionOn: motionStatistics(withScaling.log),
    dynamicResolutionOff: motionStatistics(withoutScaling.log),
  };
  const label = (name: string, statistics: ReturnType<typeof motionStatistics>): string =>
    `${name.padEnd(24)} median ${statistics.frameMilliseconds?.median.toFixed(1) ?? 'n/a'} ms, p95 ${statistics.frameMilliseconds?.p95.toFixed(1) ?? 'n/a'} ms, ${statistics.framesPerSecondAtMedian?.toFixed(2) ?? 'n/a'} fps, mean scale ${statistics.scale?.mean.toFixed(2) ?? 'n/a'}`;
  console.log(
    `adapter: ${environment.adapter.vendor} ${environment.adapter.architecture}${environment.software ? ' (software)' : ''}`,
  );
  console.log(label('dynamic resolution on', result.dynamicResolutionOn));
  console.log(label('dynamic resolution off', result.dynamicResolutionOff));
  const directory = join('bench', 'results');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `frame-times-${adapterFileName(withScaling.adapter)}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
  );
} finally {
  await browser.close();
  server.stop();
}
