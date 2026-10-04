import { linearToSrgbTransfer, type Rgb } from './xyz-srgb';

const inputMatrix: readonly (readonly [number, number, number])[] = [
  [0.59719, 0.35458, 0.04823],
  [0.076, 0.90834, 0.01566],
  [0.0284, 0.13383, 0.83777],
];

const outputMatrix: readonly (readonly [number, number, number])[] = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
];

function multiply(matrix: readonly (readonly [number, number, number])[], color: Rgb): Rgb {
  const row = (index: number): number => {
    const entries = matrix[index] ?? [0, 0, 0];
    return entries[0] * color[0] + entries[1] * color[1] + entries[2] * color[2];
  };
  return [row(0), row(1), row(2)];
}

function fit(value: number): number {
  const numerator = value * (value + 0.0245786) - 0.000090537;
  const denominator = value * (0.983729 * value + 0.432951) + 0.238081;
  return numerator / denominator;
}

export function acesFitted(color: Rgb): Rgb {
  const mixed = multiply(inputMatrix, color);
  const curved: Rgb = [fit(mixed[0]), fit(mixed[1]), fit(mixed[2])];
  const output = multiply(outputMatrix, curved);
  return [
    Math.min(Math.max(output[0], 0), 1),
    Math.min(Math.max(output[1], 0), 1),
    Math.min(Math.max(output[2], 0), 1),
  ];
}

export function exposureScale(exposureStops: number): number {
  return 2 ** exposureStops;
}

export function displayEncode(radiance: Rgb, exposureStops: number): Rgb {
  const scale = exposureScale(exposureStops);
  const mapped = acesFitted([radiance[0] * scale, radiance[1] * scale, radiance[2] * scale]);
  return [
    linearToSrgbTransfer(mapped[0]),
    linearToSrgbTransfer(mapped[1]),
    linearToSrgbTransfer(mapped[2]),
  ];
}
