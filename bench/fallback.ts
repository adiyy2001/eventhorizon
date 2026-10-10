import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { chromium, type Page } from '@playwright/test';
import { describeHost } from './environment';
import { startStaticServer } from './static-server';

interface Marks {
  firstPass: number | null;
  complete: number | null;
}

declare global {
  interface Window {
    benchMarks?: Marks;
  }
}

interface Sample {
  pageFirstImageMilliseconds: number;
  pageFullImageMilliseconds: number;
  renderFirstImageMilliseconds: number;
  renderFullImageMilliseconds: number;
}

interface ChangeSample {
  firstImageMilliseconds: number;
  fullImageMilliseconds: number;
}

const workerCounts = [1, 2, 4, 8];
const repeats = 5;
const edge = 512;
const resultPath = 'bench/results/fallback.json';
const renderTimeout = 300_000;

function oneMinuteLoad(): number {
  return Number((loadavg()[0] ?? 0).toFixed(2));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1
      ? (sorted[middle] ?? 0)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  return Math.round(value);
}

async function trackMarks(page: Page, workers: number): Promise<void> {
  await page.addInitScript((cores) => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: cores });
    const marks: Marks = { firstPass: null, complete: null };
    window.benchMarks = marks;
    new MutationObserver(() => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]');
      if (canvas === null) {
        return;
      }
      if (marks.firstPass === null && Number(canvas.getAttribute('data-passes-done')) >= 1) {
        marks.firstPass = performance.now();
      }
      if (marks.complete === null && canvas.getAttribute('data-complete') === 'true') {
        marks.complete = performance.now();
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-passes-done', 'data-complete'],
    });
  }, workers + 1);
}

async function numberAttribute(page: Page, name: string): Promise<number> {
  const value = await page.getByTestId('viewport-canvas').getAttribute(name);
  return Number(value);
}

async function waitUntilComplete(page: Page, generation: number): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]');
      return (
        canvas?.getAttribute('data-generation') === String(expected) &&
        canvas.getAttribute('data-complete') === 'true'
      );
    },
    generation,
    { timeout: renderTimeout },
  );
}

async function measureLoad(
  baseUrl: string,
  workers: number,
  launch: () => Promise<Page>,
): Promise<{ sample: Sample; change: ChangeSample }> {
  const page = await launch();
  try {
    await trackMarks(page, workers);
    await page.goto(baseUrl);
    await waitUntilComplete(page, 1);
    const marks = await page.evaluate(() => window.benchMarks);
    const renderFirst = await numberAttribute(page, 'data-first-image-ms');
    const renderFull = await numberAttribute(page, 'data-full-image-ms');
    await page.keyboard.press('ArrowRight');
    await waitUntilComplete(page, 2);
    return {
      sample: {
        pageFirstImageMilliseconds: Math.round(marks?.firstPass ?? Number.NaN),
        pageFullImageMilliseconds: Math.round(marks?.complete ?? Number.NaN),
        renderFirstImageMilliseconds: renderFirst,
        renderFullImageMilliseconds: renderFull,
      },
      change: {
        firstImageMilliseconds: await numberAttribute(page, 'data-first-image-ms'),
        fullImageMilliseconds: await numberAttribute(page, 'data-full-image-ms'),
      },
    };
  } finally {
    await page.close();
  }
}

const server = await startStaticServer(4326);
const browser = await chromium.launch();
try {
  const host = describeHost(browser);
  console.log(`${host.cpu}, ${String(host.cores)} logical cores, Chromium ${host.chromium}`);
  console.log(`${String(edge)} by ${String(edge)} pixels, median of ${String(repeats)} loads`);
  const loadAverageBefore = oneMinuteLoad();
  const results = [];
  for (const workers of workerCounts) {
    const samples: Sample[] = [];
    const changes: ChangeSample[] = [];
    for (let run = 0; run < repeats; run += 1) {
      const measured = await measureLoad(server.origin, workers, () => browser.newPage());
      samples.push(measured.sample);
      changes.push(measured.change);
    }
    const summary = {
      workers,
      pageFirstImageMilliseconds: median(
        samples.map((sample) => sample.pageFirstImageMilliseconds),
      ),
      pageFullImageMilliseconds: median(samples.map((sample) => sample.pageFullImageMilliseconds)),
      renderFirstImageMilliseconds: median(
        samples.map((sample) => sample.renderFirstImageMilliseconds),
      ),
      renderFullImageMilliseconds: median(
        samples.map((sample) => sample.renderFullImageMilliseconds),
      ),
      changeFirstImageMilliseconds: median(changes.map((change) => change.firstImageMilliseconds)),
      changeFullImageMilliseconds: median(changes.map((change) => change.fullImageMilliseconds)),
      loadAverageAfter: oneMinuteLoad(),
      samples,
      changes,
    };
    results.push(summary);
    console.log(
      `${String(workers)} workers: first image ${String(summary.pageFirstImageMilliseconds)} ms and full resolution ${String(summary.pageFullImageMilliseconds)} ms after navigation, after a camera change ${String(summary.changeFirstImageMilliseconds)} ms and ${String(summary.changeFullImageMilliseconds)} ms, one minute load ${String(summary.loadAverageAfter)}`,
    );
  }
  const record = {
    ...host,
    note: 'Plain Chromium without WebGPU flags, so the page takes the software path. The worker count is set through navigator.hardwareConcurrency, one more than the pool size. Page times run from navigation start, render times from the start of the render job. The one minute load average is recorded because other processes on the machine change the timings.',
    size: { width: edge, height: edge },
    repeats,
    loadAverageBefore,
    results,
  };
  mkdirSync('bench/results', { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(record, null, 2)}\n`);
} finally {
  await browser.close();
  server.stop();
}
