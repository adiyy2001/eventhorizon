import { type Rgb } from '../color/xyz-srgb';
import { type Vec3, dot, normalize, vec3 } from '../physics/vec3';
import { fbm3 } from './noise';

export const NEBULA_BAND_NORMAL: Vec3 = normalize(vec3(0.3, 0.9, 0.3));
export const NEBULA_BAND_WIDTH = 0.22;
export const NEBULA_CLOUD_GAIN = 0.06;
export const NEBULA_GLOW_GAIN = 0.012;
const WARM_TINT: Rgb = [1.0, 0.38, 0.3];
const COOL_TINT: Rgb = [0.3, 0.5, 1.0];
const GLOW_TINT: Rgb = [1.0, 0.92, 0.8];

export function smoothstepRange(low: number, high: number, value: number): number {
  const t = Math.min(Math.max((value - low) / (high - low), 0), 1);
  return t * t * (3 - 2 * t);
}

export function nebulaRadiance(direction: Vec3): Rgb {
  const { x, y, z } = direction;
  const offset = dot(direction, NEBULA_BAND_NORMAL);
  const band = Math.exp(-(offset * offset) / (2 * NEBULA_BAND_WIDTH * NEBULA_BAND_WIDTH));
  const warp = fbm3(x * 1.7, y * 1.7, z * 1.7, 11);
  const cloud = fbm3(x * 3.1 + warp * 1.3, y * 3.1 + warp * 1.3, z * 3.1 + warp * 1.3, 23);
  const density = smoothstepRange(0.42, 0.78, cloud);
  const hue = smoothstepRange(0.35, 0.65, fbm3(x * 1.3 + 5, y * 1.3 + 5, z * 1.3 + 5, 37));
  const dust = fbm3(x * 9, y * 9, z * 9, 41);
  const cloudScale = density * (0.25 + 0.75 * band) * NEBULA_CLOUD_GAIN;
  const glowScale = band * NEBULA_GLOW_GAIN * (0.5 + dust);
  const channel = (index: 0 | 1 | 2): number =>
    (WARM_TINT[index] * (1 - hue) + COOL_TINT[index] * hue) * cloudScale +
    GLOW_TINT[index] * glowScale;
  return [channel(0), channel(1), channel(2)];
}
