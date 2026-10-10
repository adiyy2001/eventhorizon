import { type Page } from '@playwright/test';
import { type RenderSettings } from '../src/core/render/settings';
import { type AdapterSummary } from '../src/gpu/device';
import { type ImageDifference, compareEncodedImages } from './image-compare';

export interface CpuGpuComparison extends ImageDifference {
  size: number;
  workers: number;
  gpuMilliseconds: number;
  cpuFirstImageMilliseconds: number;
  cpuFullImageMilliseconds: number;
  adapter: AdapterSummary;
}

export interface CpuGpuRequest {
  edge: number;
  cpu: RenderSettings;
  gpu: RenderSettings;
}

export async function compareCpuAgainstGpu(
  page: Page,
  request: CpuGpuRequest,
): Promise<CpuGpuComparison> {
  const { edge, cpu, gpu } = request;
  const rendered = await page.evaluate(
    async (payload) => {
      const automation = window.eventhorizonAutomation;
      if (automation === undefined) {
        throw new Error('automation hook is missing');
      }
      const started = performance.now();
      const gpuImage = await automation.exportImage({
        width: payload.edge,
        height: payload.edge,
        frames: 1,
        settings: payload.gpu,
      });
      const gpuMilliseconds = performance.now() - started;
      const cpuImage = await automation.renderCpuView({
        size: { width: payload.edge, height: payload.edge },
        settings: payload.cpu,
      });
      return { gpuImage, cpuImage, gpuMilliseconds };
    },
    { edge, cpu, gpu },
  );
  const difference = await compareEncodedImages(
    page,
    rendered.gpuImage.pngBase64,
    rendered.cpuImage.pngBase64,
  );
  return {
    ...difference,
    size: edge,
    workers: rendered.cpuImage.workers,
    gpuMilliseconds: rendered.gpuMilliseconds,
    cpuFirstImageMilliseconds: rendered.cpuImage.firstImageMilliseconds,
    cpuFullImageMilliseconds: rendered.cpuImage.fullImageMilliseconds,
    adapter: rendered.gpuImage.adapter,
  };
}
