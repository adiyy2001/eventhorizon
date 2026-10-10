import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import {
  type AuditResult,
  accessibilityThreshold,
  belowThreshold,
  categories,
  type Category,
  type FormFactor,
  formFactors,
  type Renderer,
} from '../bench/lighthouse-scores';
import { startStaticServer } from '../bench/static-server';
import { webGpuLaunchArguments } from '../playwright.config';

const port = 4321;
const debuggingPort = 9333;
const resultPath = join('bench', 'results', 'lighthouse.json');

interface RendererSetup {
  renderer: Renderer;
  flags: readonly string[];
}

const setups: readonly RendererSetup[] = [
  { renderer: 'webgpu', flags: webGpuLaunchArguments },
  { renderer: 'fallback', flags: [] },
];

async function audit(
  renderer: Renderer,
  formFactor: FormFactor,
  url: string,
): Promise<AuditResult> {
  const run = await lighthouse(url, {
    port: debuggingPort,
    output: 'json',
    logLevel: 'error',
    onlyCategories: [...categories],
    formFactor,
    screenEmulation:
      formFactor === 'mobile'
        ? { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false }
        : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
    throttlingMethod: 'provided',
    maxWaitForLoad: 60_000,
  });
  if (run === undefined) {
    throw new Error('lighthouse returned no result');
  }
  const { lhr } = run;
  const scoreOf = (id: Category): number | null => lhr.categories[id]?.score ?? null;
  const accessibility = lhr.categories['accessibility'];
  const failed = (accessibility?.auditRefs ?? []).flatMap((reference) => {
    const entry = lhr.audits[reference.id];
    return entry?.score !== null && entry?.score !== undefined && entry.score < 1
      ? [{ id: entry.id, title: entry.title, score: entry.score }]
      : [];
  });
  return {
    renderer,
    formFactor,
    scores: {
      accessibility: scoreOf('accessibility'),
      'best-practices': scoreOf('best-practices'),
      seo: scoreOf('seo'),
      performance: scoreOf('performance'),
    },
    failedAccessibilityAudits: failed,
  };
}

async function main(): Promise<void> {
  const server = await startStaticServer(port);
  try {
    const results: AuditResult[] = [];
    const browsers: { renderer: Renderer; chromium: string; flags: readonly string[] }[] = [];
    for (const setup of setups) {
      const browser = await chromium.launch({
        args: [...setup.flags, `--remote-debugging-port=${String(debuggingPort)}`],
      });
      try {
        browsers.push({
          renderer: setup.renderer,
          chromium: browser.version(),
          flags: setup.flags,
        });
        for (const formFactor of formFactors) {
          results.push(await audit(setup.renderer, formFactor, `${server.origin}/`));
        }
      } finally {
        await browser.close();
      }
    }
    const record = {
      generatedAt: new Date().toISOString(),
      node: process.version,
      platform: `${platform()} ${release()} ${arch()}`,
      cpu: cpus()[0]?.model ?? 'unknown',
      browsers,
      threshold: accessibilityThreshold,
      note: 'The webgpu runs use the software adapter and the fallback runs have no adapter at all, so the page renders with the worker pool. Performance runs with simulated throttling off. It says nothing about real GPUs, and the fallback numbers include the workers competing with the audit for the CPU.',
      results,
    };
    mkdirSync('bench/results', { recursive: true });
    writeFileSync(resultPath, `${JSON.stringify(record, null, 2)}\n`);
    for (const { renderer, formFactor, scores } of results) {
      console.log(
        `${renderer} ${formFactor}: accessibility ${String(scores.accessibility)}, best practices ${String(scores['best-practices'])}, seo ${String(scores.seo)}, performance ${String(scores.performance)}`,
      );
    }
    const failing = belowThreshold(results);
    if (failing.length > 0) {
      console.error(`accessibility below ${String(accessibilityThreshold)}: ${failing.join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    server.stop();
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  void main();
}
