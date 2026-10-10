import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baselineDirectory, baselineSpecs } from '../bench/baselines';
import { launchWebGpuBrowser } from '../bench/browser';
import { openAutomationPage, renderSettingsOnGpu } from '../bench/gpu-parity-run';
import { startStaticServer } from '../bench/static-server';

const server = await startStaticServer(4322);
const browser = await launchWebGpuBrowser();
try {
  const page = await browser.newPage();
  await openAutomationPage(page, `${server.origin}/?automation`);
  mkdirSync(baselineDirectory, { recursive: true });
  for (const file of readdirSync(baselineDirectory).filter((name) => name.endsWith('.png'))) {
    rmSync(join(baselineDirectory, file));
  }
  for (const spec of baselineSpecs) {
    const response = await renderSettingsOnGpu(
      page,
      spec.settings,
      { width: spec.size, height: spec.size },
      spec.frames,
    );
    writeFileSync(
      join(baselineDirectory, `${spec.name}.png`),
      Buffer.from(response.pngBase64, 'base64'),
    );
    console.log(`captured ${spec.name} on ${response.adapter.architecture}`);
  }
} finally {
  await browser.close();
  server.stop();
}
