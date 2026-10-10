import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchWebGpuBrowser } from './browser';
import { adapterFileName, describeEnvironment } from './environment';
import {
  openAutomationPage,
  runGpuParity,
  runImageComparison,
  runShaderCompilation,
} from './gpu-parity-run';
import { runColorParityOnGpu } from './color-parity-run';
import { startStaticServer } from './static-server';
import { type ParityReport } from '../src/core/validation/parity';

function row(label: string, report: ParityReport): string {
  return [
    label.padEnd(34),
    `${String(report.outcomeMatches)}/${String(report.total)}`.padStart(11),
    report.directionError.max.toExponential(2).padStart(11),
    report.hitRadiusRelativeError.max.toExponential(2).padStart(11),
    report.hitLambdaError.max.toExponential(2).padStart(11),
    (report.pass ? 'pass' : 'FAIL').padStart(6),
  ].join(' ');
}

const server = await startStaticServer(4323);
const browser = await launchWebGpuBrowser();
let failed: boolean;
try {
  const page = await browser.newPage();
  await openAutomationPage(page, `${server.origin}/?automation`);
  const compilation = await runShaderCompilation(page);
  const parity = await runGpuParity(page);
  const image = await runImageComparison(page);
  const color = await runColorParityOnGpu(page);

  console.log(`adapter: ${parity.adapter.vendor} ${parity.adapter.architecture}`);
  console.log(
    [
      'comparison'.padEnd(34),
      'outcomes'.padStart(11),
      'dir max rad'.padStart(11),
      'radius rel'.padStart(11),
      'lambda abs'.padStart(11),
      'result'.padStart(6),
    ].join(' '),
  );
  console.log(row('GPU against float64', parity.gpuAgainstFloat64));
  console.log(row('float32 twin against float64', parity.float32TwinAgainstFloat64));
  console.log(row('GPU against float32 twin', parity.gpuAgainstFloat32Twin));
  console.log(
    `image ${String(image.comparison.size.width)}x${String(image.comparison.size.height)}: ${String(image.comparison.agreeingPixels)}/${String(image.comparison.pixelCount)} outcomes agree, ${String(image.comparison.mismatchesOutsideBand)} mismatches outside the band`,
  );

  for (const report of color.reports) {
    console.log(
      `colour ${report.mode.padEnd(8)} ${String(report.samples).padStart(4)} samples, max abs ${report.maxAbsoluteError.toExponential(2)}, max rel ${report.maxRelativeError.toExponential(2)}, ${report.pass ? 'pass' : 'FAIL'}`,
    );
  }
  console.log(
    `disk radiance relative error mean ${image.comparison.diskRadianceMeanRelativeError.toExponential(2)}, max ${image.comparison.diskRadianceMaxRelativeError.toExponential(2)}; sky aggregate ${image.comparison.skyAggregateRelativeError.toExponential(2)}, max abs ${image.comparison.skyMaxAbsoluteError.toExponential(2)} over ${String(image.comparison.skyPixels)} pixels`,
  );

  const environment = describeEnvironment(browser, parity.adapter);
  const imageOk =
    image.comparison.agreeingPixels / image.comparison.pixelCount >= 0.995 &&
    image.comparison.mismatchesOutsideBand === 0;
  const compileOk = Object.values(compilation.messages).every((messages) => messages.length === 0);
  const colorOk = color.reports.every((report) => report.pass);
  failed = !parity.gpuAgainstFloat64.pass || !imageOk || !compileOk || !colorOk;

  const directory = join('bench', 'results');
  mkdirSync(directory, { recursive: true });
  const { gpuAgainstFloat64, float32TwinAgainstFloat64, gpuAgainstFloat32Twin, ...rest } = parity;
  writeFileSync(
    join(directory, `gpu-parity-${adapterFileName(parity.adapter)}.json`),
    `${JSON.stringify(
      {
        ...environment,
        pass: !failed,
        shaderCompileMessages: compilation.messages,
        ...rest,
        gpuAgainstFloat64: {
          ...gpuAgainstFloat64,
          outcomeMismatches: gpuAgainstFloat64.outcomeMismatches.slice(0, 50),
        },
        float32TwinAgainstFloat64,
        gpuAgainstFloat32Twin,
        image: image.comparison,
        colorParity: color.reports,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await browser.close();
  server.stop();
}
if (failed) {
  console.error('GPU parity failed');
  process.exitCode = 1;
}
