import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baselineDirectory, baselineSpecs } from '../bench/baselines';
import { launchWebGpuBrowser } from '../bench/browser';
import { openAutomationPage } from '../bench/gpu-parity-run';
import { startStaticServer } from '../bench/static-server';
import { defaultPost } from '../src/core/render/post';

const server = await startStaticServer(4322);
const browser = await launchWebGpuBrowser();
try {
  const page = await browser.newPage();
  await openAutomationPage(page, `${server.origin}/?automation`);
  mkdirSync(baselineDirectory, { recursive: true });
  for (const spec of baselineSpecs) {
    const response = await page.evaluate(
      async (payload) => {
        const automation = window.eventhorizonAutomation;
        if (automation === undefined) {
          throw new Error('automation hook is missing');
        }
        return automation.renderView(payload);
      },
      {
        view: spec.view,
        size: { width: spec.size, height: spec.size },
        frames: spec.frames,
        post: defaultPost,
      },
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
