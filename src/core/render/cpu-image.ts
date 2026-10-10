import { type ViewportSize } from '../physics/observer';
import { computeGlow } from './bloom';
import { renderCpuScene } from './cpu-frame';
import { encodeFrame } from './cpu-post';
import { type RenderSettings } from './settings';

export function renderCpuImage(
  settings: RenderSettings,
  size: ViewportSize,
): Uint8ClampedArray<ArrayBuffer> {
  const scene = renderCpuScene(settings, size);
  const glow = settings.bloomStrength > 0 ? computeGlow(scene, size) : null;
  return encodeFrame(scene, glow, settings, size, { dither: true });
}
