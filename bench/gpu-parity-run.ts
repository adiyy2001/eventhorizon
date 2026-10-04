import { type Page } from '@playwright/test';
import type { CompileResponse, ParityResponse, RenderResponse } from '../src/app/automation';
import { CRITICAL_IMPACT_PARAMETER, ISCO_RADIUS } from '../src/core/physics/constants';
import { staticObserverRay } from '../src/core/physics/observer';
import { traceRay } from '../src/core/physics/trace';
import { staticObserverState32, traceRayFloat32 } from '../src/core/physics/trace-float32';
import { vec3 } from '../src/core/physics/vec3';
import { type ViewDescription, defaultView } from '../src/core/render/view';
import { renderReferenceImage, type ReferenceImage } from '../src/core/render/reference-image';
import {
  compareRecords,
  OUTCOME_CODES,
  type ParityReport,
  type RayRecord,
} from '../src/core/validation/parity';
import {
  defaultParitySpec,
  generateParityRays,
  parityTraceOptions,
  parityView,
  type ParityRay,
} from '../src/core/validation/parity-rays';
import { recordFromFloat32, recordFromTrace } from '../src/core/validation/records';
import { openAutomationPage } from './gpu-session';

export interface ParityRunResult {
  adapter: ParityResponse['adapter'];
  rayCount: number;
  spec: typeof defaultParitySpec;
  gpuMilliseconds: number;
  cpuMilliseconds: number;
  shaderMessages: Record<string, unknown[]>;
  gpuAgainstFloat64: ParityReport;
  float32TwinAgainstFloat64: ParityReport;
  gpuAgainstFloat32Twin: ParityReport;
  crossingStatistics: {
    multiCrossing: number;
    laterCrossingHit: number;
    diskHits: number;
  };
}

export interface ImageComparison {
  size: { width: number; height: number };
  pixelCount: number;
  agreeingPixels: number;
  mismatchedPixels: number;
  mismatchesOutsideBand: number;
  outcomeCounts: Record<string, number>;
  diskRadianceMeanRelativeError: number;
  diskRadianceMaxRelativeError: number;
  skyPixels: number;
  skyAggregateRelativeError: number;
  skyMaxAbsoluteError: number;
  disagreementBand: { criticalMargin: number; diskEdgeMargin: number };
}

export const imageBandCriticalMargin = 0.05;
export const imageBandDiskEdgeMargin = 5e-3;

export async function runShaderCompilation(page: Page): Promise<CompileResponse> {
  return page.evaluate(async () => {
    const automation = window.eventhorizonAutomation;
    if (automation === undefined) {
      throw new Error('automation hook is missing');
    }
    return automation.compileShaders();
  });
}

function parityRequest(rays: readonly ParityRay[]) {
  return {
    rays: rays.map((ray) => ({
      position: [...ray.position] as [number, number, number],
      direction: [...ray.direction] as [number, number, number],
    })),
    view: parityView(defaultParitySpec),
  };
}

export async function runGpuParity(page: Page): Promise<ParityRunResult> {
  const rays = generateParityRays(defaultParitySpec);
  const options = parityTraceOptions(defaultParitySpec);

  const cpuStarted = performance.now();
  const reference: RayRecord[] = [];
  const twin: RayRecord[] = [];
  for (const ray of rays) {
    reference.push(
      recordFromTrace(
        traceRay(staticObserverRay(vec3(...ray.position), vec3(...ray.direction)), options),
      ),
    );
    twin.push(
      recordFromFloat32(
        traceRayFloat32(
          staticObserverState32(vec3(...ray.position), vec3(...ray.direction)),
          options,
        ),
      ),
    );
  }
  const cpuMilliseconds = performance.now() - cpuStarted;

  const request = parityRequest(rays);
  const response: ParityResponse = await page.evaluate(async (payload) => {
    const automation = window.eventhorizonAutomation;
    if (automation === undefined) {
      throw new Error('automation hook is missing');
    }
    return automation.runParity(payload);
  }, request);

  const diskHits = reference.filter((record) => record.outcome === OUTCOME_CODES.disk);
  return {
    adapter: response.adapter,
    rayCount: rays.length,
    spec: defaultParitySpec,
    gpuMilliseconds: response.milliseconds,
    cpuMilliseconds,
    shaderMessages: { parity: response.messages },
    gpuAgainstFloat64: compareRecords(reference, response.records),
    float32TwinAgainstFloat64: compareRecords(reference, twin),
    gpuAgainstFloat32Twin: compareRecords(twin, response.records),
    crossingStatistics: {
      multiCrossing: reference.filter((record) => record.crossings >= 2).length,
      laterCrossingHit: diskHits.filter((record) => record.hitIndex >= 2).length,
      diskHits: diskHits.length,
    },
  };
}

function luminanceAt(values: readonly number[] | Float32Array, index: number): number {
  return (
    0.2126 * (values[index * 3] ?? 0) +
    0.7152 * (values[index * 3 + 1] ?? 0) +
    0.0722 * (values[index * 3 + 2] ?? 0)
  );
}

export function compareImages(
  reference: ReferenceImage,
  gpu: { outcomes: readonly number[]; radiance: readonly number[] },
  view: ViewDescription,
  criticalBand = imageBandCriticalMargin,
  diskEdgeBand = imageBandDiskEdgeMargin,
): ImageComparison {
  const pixelCount = reference.size.width * reference.size.height;
  let agreeing = 0;
  let outsideBand = 0;
  let diskMaxRelative = 0;
  let diskTotalRelative = 0;
  let diskPixels = 0;
  let skyPixels = 0;
  let skyReferenceTotal = 0;
  let skyDifferenceTotal = 0;
  let skyMaxAbsolute = 0;
  const outcomeCounts: Record<string, number> = { captured: 0, escaped: 0, disk: 0 };
  const names = Object.keys(OUTCOME_CODES);
  for (let index = 0; index < pixelCount; index += 1) {
    const expected = reference.outcomes[index] ?? 0;
    const actual = gpu.outcomes[index];
    const name = names[expected] ?? 'captured';
    outcomeCounts[name] = (outcomeCounts[name] ?? 0) + 1;
    if (expected === actual) {
      agreeing += 1;
      const expectedLuminance = luminanceAt(reference.radiance, index);
      const actualLuminance = luminanceAt(gpu.radiance, index);
      if (expected === OUTCOME_CODES.disk) {
        const relative =
          Math.abs(actualLuminance - expectedLuminance) / Math.max(expectedLuminance, 1e-6);
        diskMaxRelative = Math.max(diskMaxRelative, relative);
        diskTotalRelative += relative;
        diskPixels += 1;
      } else if (expected === OUTCOME_CODES.escaped) {
        const difference = Math.abs(actualLuminance - expectedLuminance);
        skyPixels += 1;
        skyReferenceTotal += expectedLuminance;
        skyDifferenceTotal += difference;
        skyMaxAbsolute = Math.max(skyMaxAbsolute, difference);
      }
      continue;
    }
    const impact = reference.impactParameters[index] ?? 0;
    const nearCritical = Math.abs(impact - CRITICAL_IMPACT_PARAMETER) < criticalBand;
    const radius = reference.hitRadius[index] ?? 0;
    const nearEdge =
      Math.abs(radius - ISCO_RADIUS) < diskEdgeBand ||
      Math.abs(radius - view.diskOuterRadius) < diskEdgeBand;
    if (!nearCritical && !nearEdge) {
      outsideBand += 1;
    }
  }
  return {
    size: reference.size,
    pixelCount,
    agreeingPixels: agreeing,
    mismatchedPixels: pixelCount - agreeing,
    mismatchesOutsideBand: outsideBand,
    outcomeCounts,
    diskRadianceMeanRelativeError: diskPixels === 0 ? 0 : diskTotalRelative / diskPixels,
    diskRadianceMaxRelativeError: diskMaxRelative,
    skyPixels,
    skyAggregateRelativeError: skyReferenceTotal === 0 ? 0 : skyDifferenceTotal / skyReferenceTotal,
    skyMaxAbsoluteError: skyMaxAbsolute,
    disagreementBand: { criticalMargin: criticalBand, diskEdgeMargin: diskEdgeBand },
  };
}

export async function renderOnGpu(
  page: Page,
  view: ViewDescription,
  size: { width: number; height: number },
): Promise<RenderResponse> {
  return page.evaluate(
    async (payload) => {
      const automation = window.eventhorizonAutomation;
      if (automation === undefined) {
        throw new Error('automation hook is missing');
      }
      return automation.renderView(payload);
    },
    { view, size },
  );
}

export async function runImageComparison(
  page: Page,
  view: ViewDescription = defaultView,
  size = { width: 128, height: 128 },
): Promise<{ comparison: ImageComparison; response: RenderResponse }> {
  const reference = renderReferenceImage(view, size);
  const response = await renderOnGpu(page, view, size);
  return { comparison: compareImages(reference, response, view), response };
}

export { openAutomationPage };
