import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  openAutomationPage,
  runGpuParity,
  runImageComparison,
  runShaderCompilation,
} from '../bench/gpu-parity-run';

const artifactDirectory = join('test-results', 'gpu-parity');

test.describe('GPU tracer against the float64 reference', () => {
  test.beforeEach(async ({ page }) => {
    await openAutomationPage(page);
  });

  test('every shader compiles without messages', async ({ page }) => {
    const { messages } = await runShaderCompilation(page);
    for (const [name, list] of Object.entries(messages)) {
      expect(list, name).toEqual([]);
    }
  });

  test('outcomes, directions and disk hits agree on the fixed ray set', async ({ page }) => {
    test.setTimeout(240_000);
    const result = await runGpuParity(page);
    expect(result.rayCount).toBeGreaterThanOrEqual(4096);
    const report = result.gpuAgainstFloat64;
    expect(report.outcomeMismatches).toEqual([]);
    expect(report.directionViolations).toEqual([]);
    expect(report.hitRadiusViolations).toEqual([]);
    expect(report.hitLambdaViolations).toEqual([]);
    expect(report.stepLimitRays).toBe(0);
    expect(result.crossingStatistics.laterCrossingHit).toBeGreaterThan(0);
  });

  test('the first image has the same outcome map as the CPU render', async ({ page }) => {
    test.setTimeout(240_000);
    const { comparison, response } = await runImageComparison(page);
    mkdirSync(artifactDirectory, { recursive: true });
    writeFileSync(
      join(artifactDirectory, 'first-image.png'),
      Buffer.from(response.pngBase64, 'base64'),
    );
    expect(comparison.agreeingPixels / comparison.pixelCount).toBeGreaterThanOrEqual(0.995);
    expect(comparison.mismatchesOutsideBand).toBe(0);
    expect(comparison.diskShadeMeanRelativeError).toBeLessThan(1e-4);
    expect(comparison.escapedShadeMismatches).toBe(0);
  });
});
