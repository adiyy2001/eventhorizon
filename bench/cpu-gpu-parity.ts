import { mkdirSync, writeFileSync } from 'node:fs';
import { launchWebGpuBrowser } from './browser';
import { compareCpuAgainstGpu } from './cpu-gpu-run';
import { cpuGpuEdge, cpuGpuMeanAbsoluteTolerance, cpuGpuScenarios } from './cpu-gpu-scenarios';
import { type AdapterSummary } from '../src/gpu/device';
import { describeEnvironment } from './environment';
import { openAutomationPage } from './gpu-session';
import { startStaticServer } from './static-server';

const resultPath = 'bench/results/cpu-gpu-parity.json';

const server = await startStaticServer(4325);
const browser = await launchWebGpuBrowser();
try {
  const page = await browser.newPage();
  await openAutomationPage(page, `${server.origin}/?automation`);
  const results = [];
  let adapter: AdapterSummary | null = null;
  for (const scenario of cpuGpuScenarios) {
    const { adapter: used, ...numbers } = await compareCpuAgainstGpu(page, {
      edge: cpuGpuEdge,
      cpu: scenario.settings,
      gpu: scenario.settings,
    });
    adapter = used;
    results.push({ name: scenario.name, ...numbers });
    console.log(
      `${scenario.name}: mean ${numbers.mean.toFixed(4)}, max ${String(numbers.max)} of 255`,
    );
  }
  if (adapter === null) {
    throw new Error('no scenario was compared');
  }
  const worst = Math.max(...results.map((result) => result.mean));
  const record = {
    ...describeEnvironment(browser, adapter),
    edge: cpuGpuEdge,
    tolerance: cpuGpuMeanAbsoluteTolerance,
    note: 'Mean and maximum absolute difference per colour channel on a 0 to 255 scale, graphics image with one sample per pixel against the software image.',
    worstMean: worst,
    results,
  };
  mkdirSync('bench/results', { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`worst mean ${worst.toFixed(4)}, tolerance ${String(cpuGpuMeanAbsoluteTolerance)}`);
  if (worst >= cpuGpuMeanAbsoluteTolerance) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.stop();
}
