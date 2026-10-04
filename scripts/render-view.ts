import { writeFileSync } from 'node:fs';
import { launchWebGpuBrowser } from '../bench/browser';
import { openAutomationPage, renderOnGpu } from '../bench/gpu-parity-run';
import { startStaticServer } from '../bench/static-server';
import { defaultView, type ViewDescription } from '../src/core/render/view';

const [outputPath = 'view.png', sizeText = '512', inclinationText = '75', outerText = '20'] =
  process.argv.slice(2);
const overridesText = process.env['VIEW_OVERRIDES'];
const overrides =
  overridesText === undefined ? {} : (JSON.parse(overridesText) as Partial<ViewDescription>);

const server = await startStaticServer(4177);
const browser = await launchWebGpuBrowser();
try {
  const page = await browser.newPage();
  await openAutomationPage(page, `${server.origin}/?automation`);
  const size = Number(sizeText);
  const view: ViewDescription = {
    ...defaultView,
    inclination: (Number(inclinationText) * Math.PI) / 180,
    diskOuterRadius: Number(outerText),
    ...overrides,
  };
  const started = performance.now();
  const response = await renderOnGpu(page, view, { width: size, height: size });
  console.log(
    `rendered ${String(size)}x${String(size)} in ${(performance.now() - started).toFixed(0)} ms on ${response.adapter.architecture}`,
  );
  writeFileSync(outputPath, Buffer.from(response.pngBase64, 'base64'));
} finally {
  await browser.close();
  server.stop();
}
