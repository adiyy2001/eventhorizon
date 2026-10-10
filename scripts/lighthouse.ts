import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { startStaticServer } from '../bench/static-server';
import { webGpuLaunchArguments } from '../playwright.config';

export const accessibilityThreshold = 0.95;
const port = 4321;
const debuggingPort = 9333;
const resultPath = join('bench', 'results', 'lighthouse.json');
const formFactors = ['mobile', 'desktop'] as const;
const categories = ['accessibility', 'best-practices', 'seo', 'performance'] as const;

type FormFactor = (typeof formFactors)[number];

interface FailedAudit {
  id: string;
  title: string;
  score: number | null;
}

interface FormFactorResult {
  formFactor: FormFactor;
  scores: Record<(typeof categories)[number], number | null>;
  failedAccessibilityAudits: FailedAudit[];
}

export function belowThreshold(results: readonly FormFactorResult[]): FormFactor[] {
  return results
    .filter(({ scores }) => (scores.accessibility ?? 0) < accessibilityThreshold)
    .map(({ formFactor }) => formFactor);
}

async function audit(formFactor: FormFactor, url: string): Promise<FormFactorResult> {
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
  const scoreOf = (id: (typeof categories)[number]): number | null =>
    lhr.categories[id]?.score ?? null;
  const accessibility = lhr.categories['accessibility'];
  const failed = (accessibility?.auditRefs ?? []).flatMap((reference) => {
    const entry = lhr.audits[reference.id];
    return entry?.score !== null && entry?.score !== undefined && entry.score < 1
      ? [{ id: entry.id, title: entry.title, score: entry.score }]
      : [];
  });
  return {
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
  const browser = await chromium.launch({
    args: [...webGpuLaunchArguments, `--remote-debugging-port=${String(debuggingPort)}`],
  });
  try {
    const results: FormFactorResult[] = [];
    for (const formFactor of formFactors) {
      results.push(await audit(formFactor, `${server.origin}/`));
    }
    const record = {
      generatedAt: new Date().toISOString(),
      node: process.version,
      platform: `${platform()} ${release()} ${arch()}`,
      cpu: cpus()[0]?.model ?? 'unknown',
      chromium: browser.version(),
      chromiumFlags: webGpuLaunchArguments,
      threshold: accessibilityThreshold,
      note: 'Performance runs on the software adapter with simulated throttling off, so it says nothing about real GPUs.',
      results,
    };
    mkdirSync('bench/results', { recursive: true });
    writeFileSync(resultPath, `${JSON.stringify(record, null, 2)}\n`);
    for (const { formFactor, scores } of results) {
      console.log(
        `${formFactor}: accessibility ${String(scores.accessibility)}, best practices ${String(scores['best-practices'])}, seo ${String(scores.seo)}, performance ${String(scores.performance)}`,
      );
    }
    const failing = belowThreshold(results);
    if (failing.length > 0) {
      console.error(`accessibility below ${String(accessibilityThreshold)}: ${failing.join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.stop();
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  void main();
}
