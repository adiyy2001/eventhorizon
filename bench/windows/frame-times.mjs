import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';

const origin = process.argv[2] ?? 'http://localhost:4326';
const out = process.argv[3] ?? 'frames-result.json';
const moveFrames = Number(process.argv[4] ?? '90');
const width = Number(process.argv[5] ?? '1920');
const height = Number(process.argv[6] ?? '1080');
const exe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const pct = (values, f) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length === 0
    ? null
    : s[Math.min(s.length - 1, Math.max(0, Math.ceil(f * s.length) - 1))];
};
const summarize = (values) =>
  values.length === 0
    ? null
    : {
        count: values.length,
        median: pct(values, 0.5),
        p95: pct(values, 0.95),
        mean: values.reduce((a, b) => a + b, 0) / values.length,
      };
const stats = (log) => {
  const moving = log.filter((e) => e.moving && e.frameMs > 0);
  const frame = summarize(moving.map((e) => e.frameMs));
  return {
    movingFrames: moving.length,
    restFrames: log.filter((e) => !e.moving).length,
    frameMilliseconds: frame,
    framesPerSecondAtMedian: frame === null ? null : 1000 / frame.median,
    gpuMilliseconds: summarize(moving.flatMap((e) => (e.gpuMs === null ? [] : [e.gpuMs]))),
    scale: summarize(moving.map((e) => e.scale)),
  };
};

const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    ...(process.env.EXTRA_FLAGS ? process.env.EXTRA_FLAGS.split(' ') : []),
  ],
});
try {
  const page = await browser.newPage();
  await page.goto(`${origin}/?automation`);
  await page.waitForFunction(() => window.eventhorizonAutomation !== undefined);
  const run = (dynamicResolution) =>
    page.evaluate(async (payload) => window.eventhorizonAutomation.runMotion(payload), {
      size: { width, height },
      plan: { restFrames: 3, moveFrames, settleFrames: 3 },
      dynamicResolution,
    });
  const on = await run(true);
  const off = await run(false);
  const result = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cores: os.cpus().length,
    memoryGigabytes: Math.round(os.totalmem() / 2 ** 30),
    chromium: browser.version(),
    chromiumFlags: [
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      ...(process.env.EXTRA_FLAGS ? process.env.EXTRA_FLAGS.split(' ') : []),
    ],
    adapter: on.adapter,
    software: /swiftshader|llvmpipe|software/i.test(JSON.stringify(on.adapter)),
    viewport: { width, height },
    plan: { restFrames: 3, moveFrames, settleFrames: 3 },
    timestampQuery: on.timestampQuery,
    dynamicResolutionOn: stats(on.log),
    dynamicResolutionOff: stats(off.log),
  };
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
