import { type Xyz } from './cmf';

export type Rgb = readonly [number, number, number];

export const xyzToLinearSrgbMatrix: readonly (readonly [number, number, number])[] = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

export function xyzToLinearSrgb(color: Xyz): Rgb {
  const [r, g, b] = xyzToLinearSrgbMatrix.map(
    (row) => row[0] * color.x + row[1] * color.y + row[2] * color.z,
  );
  return [r ?? 0, g ?? 0, b ?? 0];
}

export function linearToSrgbTransfer(linear: number): number {
  if (linear <= 0.0031308) {
    return 12.92 * linear;
  }
  return 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
}

export function srgbToLinearTransfer(encoded: number): number {
  if (encoded <= 0.04045) {
    return encoded / 12.92;
  }
  return Math.pow((encoded + 0.055) / 1.055, 2.4);
}

export function luminanceOfLinearSrgb(color: Rgb): number {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

export function clipToGamutAtUnitLuminance(color: Rgb): Rgb {
  const clipped: Rgb = [Math.max(color[0], 0), Math.max(color[1], 0), Math.max(color[2], 0)];
  const luminance = luminanceOfLinearSrgb(clipped);
  if (luminance <= 0) {
    return [0, 0, 0];
  }
  return [clipped[0] / luminance, clipped[1] / luminance, clipped[2] / luminance];
}
