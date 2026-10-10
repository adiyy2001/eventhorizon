import { linearToSrgbTransfer, type MutableRgb, type Rgb } from './xyz-srgb';

const [[a00, a01, a02], [a10, a11, a12], [a20, a21, a22]] = [
  [0.59719, 0.35458, 0.04823],
  [0.076, 0.90834, 0.01566],
  [0.0284, 0.13383, 0.83777],
] as const;

const [[b00, b01, b02], [b10, b11, b12], [b20, b21, b22]] = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
] as const;

function fit(value: number): number {
  const numerator = value * (value + 0.0245786) - 0.000090537;
  const denominator = value * (0.983729 * value + 0.432951) + 0.238081;
  return numerator / denominator;
}

function unit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function acesFittedInto(target: MutableRgb, red: number, green: number, blue: number): void {
  const curvedRed = fit(a00 * red + a01 * green + a02 * blue);
  const curvedGreen = fit(a10 * red + a11 * green + a12 * blue);
  const curvedBlue = fit(a20 * red + a21 * green + a22 * blue);
  target[0] = unit(b00 * curvedRed + b01 * curvedGreen + b02 * curvedBlue);
  target[1] = unit(b10 * curvedRed + b11 * curvedGreen + b12 * curvedBlue);
  target[2] = unit(b20 * curvedRed + b21 * curvedGreen + b22 * curvedBlue);
}

export function acesFitted(color: Rgb): Rgb {
  const mapped: MutableRgb = [0, 0, 0];
  acesFittedInto(mapped, color[0], color[1], color[2]);
  return mapped;
}

export function exposureScale(exposureStops: number): number {
  return 2 ** exposureStops;
}

export function displayEncodeInto(
  target: MutableRgb,
  red: number,
  green: number,
  blue: number,
  scale: number,
): void {
  acesFittedInto(target, red * scale, green * scale, blue * scale);
  target[0] = linearToSrgbTransfer(target[0]);
  target[1] = linearToSrgbTransfer(target[1]);
  target[2] = linearToSrgbTransfer(target[2]);
}

export function displayEncode(radiance: Rgb, exposureStops: number): Rgb {
  const encoded: MutableRgb = [0, 0, 0];
  displayEncodeInto(encoded, radiance[0], radiance[1], radiance[2], exposureScale(exposureStops));
  return encoded;
}
