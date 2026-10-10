import { type ViewportSize } from '../physics/observer';

export const maxBloomLevels = 5;
const smallestLevelEdge = 4;
const channels = 3;

export interface RgbImage {
  width: number;
  height: number;
  data: Float32Array;
}

type TapOffset = readonly [number, number];

const downsampleOffsets: readonly TapOffset[] = [
  [-2, 2],
  [0, 2],
  [2, 2],
  [-2, 0],
  [0, 0],
  [2, 0],
  [-2, -2],
  [0, -2],
  [2, -2],
  [-1, 1],
  [1, 1],
  [-1, -1],
  [1, -1],
];

const downsampleWeights: readonly number[] = [
  0.03125, 0.0625, 0.03125, 0.0625, 0.125, 0.0625, 0.03125, 0.0625, 0.03125, 0.125, 0.125, 0.125,
  0.125,
];

const averagedGroups: readonly (readonly [number, number, number, number])[] = [
  [9, 10, 11, 12],
  [0, 1, 3, 4],
  [1, 2, 4, 5],
  [3, 4, 6, 7],
  [4, 5, 7, 8],
];

const averagedGroupWeights: readonly number[] = [0.5, 0.125, 0.125, 0.125, 0.125];

const upsampleTaps: readonly (readonly [number, number, number])[] = [
  [-1, 1, 1 / 16],
  [1, 1, 1 / 16],
  [-1, -1, 1 / 16],
  [1, -1, 1 / 16],
  [0, 1, 2 / 16],
  [0, -1, 2 / 16],
  [1, 0, 2 / 16],
  [-1, 0, 2 / 16],
  [0, 0, 4 / 16],
];

const luminanceWeights = [0.2126, 0.7152, 0.0722] as const;

export function bloomLevelSizes(size: ViewportSize): ViewportSize[] {
  const sizes: ViewportSize[] = [];
  let width = Math.max(1, Math.floor(size.width / 2));
  let height = Math.max(1, Math.floor(size.height / 2));
  while (sizes.length < maxBloomLevels && Math.min(width, height) >= smallestLevelEdge) {
    sizes.push({ width, height });
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  }
  return sizes.length === 0 ? [{ width: 1, height: 1 }] : sizes;
}

function createImage(size: ViewportSize): RgbImage {
  return {
    width: size.width,
    height: size.height,
    data: new Float32Array(size.width * size.height * channels),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function sampleImage(
  image: RgbImage,
  u: number,
  v: number,
  target: Float64Array,
  offset: number,
): void {
  const x = u * image.width - 0.5;
  const y = v * image.height - 0.5;
  const left = Math.floor(x);
  const top = Math.floor(y);
  const fractionX = x - left;
  const fractionY = y - top;
  const x0 = clamp(left, 0, image.width - 1);
  const x1 = clamp(left + 1, 0, image.width - 1);
  const y0 = clamp(top, 0, image.height - 1);
  const y1 = clamp(top + 1, 0, image.height - 1);
  const topLeft = (y0 * image.width + x0) * channels;
  const topRight = (y0 * image.width + x1) * channels;
  const bottomLeft = (y1 * image.width + x0) * channels;
  const bottomRight = (y1 * image.width + x1) * channels;
  const weightTopLeft = (1 - fractionX) * (1 - fractionY);
  const weightTopRight = fractionX * (1 - fractionY);
  const weightBottomLeft = (1 - fractionX) * fractionY;
  const weightBottomRight = fractionX * fractionY;
  const { data } = image;
  for (let channel = 0; channel < channels; channel += 1) {
    target[offset + channel] =
      (data[topLeft + channel] ?? 0) * weightTopLeft +
      (data[topRight + channel] ?? 0) * weightTopRight +
      (data[bottomLeft + channel] ?? 0) * weightBottomLeft +
      (data[bottomRight + channel] ?? 0) * weightBottomRight;
  }
}

function tap(
  source: RgbImage,
  u: number,
  v: number,
  offsetX: number,
  offsetY: number,
  target: Float64Array,
  slot: number,
): void {
  const texelU = 1 / source.width;
  const texelV = 1 / source.height;
  sampleImage(
    source,
    clamp(u + offsetX * texelU, 0.5 * texelU, 1 - 0.5 * texelU),
    clamp(v + offsetY * texelV, 0.5 * texelV, 1 - 0.5 * texelV),
    target,
    slot * channels,
  );
}

const averageScratch = new Float64Array(channels);

function addAveragedGroup(
  taps: Float64Array,
  group: readonly [number, number, number, number],
  weight: number,
  output: Float64Array,
): void {
  for (let channel = 0; channel < channels; channel += 1) {
    let sum = 0;
    for (const slot of group) {
      sum += taps[slot * channels + channel] ?? 0;
    }
    averageScratch[channel] = 0.25 * sum;
  }
  const brightness =
    luminanceWeights[0] * (averageScratch[0] ?? 0) +
    luminanceWeights[1] * (averageScratch[1] ?? 0) +
    luminanceWeights[2] * (averageScratch[2] ?? 0);
  const scale = weight / (1 + brightness);
  for (let channel = 0; channel < channels; channel += 1) {
    output[channel] = (output[channel] ?? 0) + (averageScratch[channel] ?? 0) * scale;
  }
}

function addWeightedTaps(taps: Float64Array, output: Float64Array): void {
  for (let slot = 0; slot < downsampleWeights.length; slot += 1) {
    const weight = downsampleWeights[slot] ?? 0;
    for (let channel = 0; channel < channels; channel += 1) {
      output[channel] = (output[channel] ?? 0) + weight * (taps[slot * channels + channel] ?? 0);
    }
  }
}

function downsample(source: RgbImage, target: RgbImage, damped: boolean): void {
  const taps = new Float64Array(downsampleOffsets.length * channels);
  const output = new Float64Array(channels);
  for (let row = 0; row < target.height; row += 1) {
    for (let column = 0; column < target.width; column += 1) {
      const u = (column + 0.5) / target.width;
      const v = (row + 0.5) / target.height;
      for (let slot = 0; slot < downsampleOffsets.length; slot += 1) {
        const [offsetX, offsetY] = downsampleOffsets[slot] ?? [0, 0];
        tap(source, u, v, offsetX, offsetY, taps, slot);
      }
      output.fill(0);
      if (damped) {
        for (let index = 0; index < averagedGroups.length; index += 1) {
          const group = averagedGroups[index];
          if (group !== undefined) {
            addAveragedGroup(taps, group, averagedGroupWeights[index] ?? 0, output);
          }
        }
      } else {
        addWeightedTaps(taps, output);
      }
      target.data.set(output, (row * target.width + column) * channels);
    }
  }
}

function addUpsampled(source: RgbImage, target: RgbImage): void {
  const sample = new Float64Array(channels);
  const accumulated = new Float64Array(channels);
  for (let row = 0; row < target.height; row += 1) {
    for (let column = 0; column < target.width; column += 1) {
      const u = (column + 0.5) / target.width;
      const v = (row + 0.5) / target.height;
      accumulated.fill(0);
      for (const [offsetX, offsetY, weight] of upsampleTaps) {
        tap(source, u, v, offsetX, offsetY, sample, 0);
        for (let channel = 0; channel < channels; channel += 1) {
          accumulated[channel] = (accumulated[channel] ?? 0) + weight * (sample[channel] ?? 0);
        }
      }
      const base = (row * target.width + column) * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        target.data[base + channel] =
          (target.data[base + channel] ?? 0) + (accumulated[channel] ?? 0);
      }
    }
  }
}

export function computeGlow(scene: Float32Array, size: ViewportSize): RgbImage {
  const levels = bloomLevelSizes(size).map(createImage);
  const sceneImage: RgbImage = { width: size.width, height: size.height, data: scene };
  levels.forEach((level, index) => {
    downsample(levels[index - 1] ?? sceneImage, level, index === 0);
  });
  for (let index = levels.length - 2; index >= 0; index -= 1) {
    const smaller = levels[index + 1];
    const larger = levels[index];
    if (smaller !== undefined && larger !== undefined) {
      addUpsampled(smaller, larger);
    }
  }
  const [glow] = levels;
  if (glow === undefined) {
    throw new Error('the bloom chain has no levels');
  }
  return glow;
}
