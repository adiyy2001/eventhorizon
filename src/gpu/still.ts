import { type ViewportSize } from '../core/physics/observer';
import { clampExportFrames, clampExportSize } from '../core/render/export';
import { type RenderSettings } from '../core/render/settings';
import { type CapturedImage, Renderer } from './renderer';
import { type SkyResources } from './sky-resources';

export interface StillRequest {
  settings: RenderSettings;
  size: ViewportSize;
  frames?: number;
}

export async function renderStill(
  device: GPUDevice,
  sky: SkyResources,
  request: StillRequest,
  fallback: ViewportSize,
): Promise<CapturedImage> {
  const size = clampExportSize(request.size, fallback);
  const renderer = await Renderer.create(device, size, null, sky);
  try {
    await renderer.renderFrames(request.settings, clampExportFrames(request.frames));
    return await renderer.capture(request.settings);
  } finally {
    renderer.destroy();
  }
}
