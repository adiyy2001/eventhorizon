import { hash3, unitFloat } from '../background/hash';
import { displayEncode } from '../color/tonemap';
import { type RgbImage } from './bloom';
import { ditherNoise, encodeFrame } from './cpu-post';
import { defaultSettings, mergeSettings } from './settings';

const size = { width: 8, height: 6 };
const plain = mergeSettings(defaultSettings, { bloomStrength: 0, exposure: 0 });

function uniformScene(value: readonly [number, number, number], pixels = 48): Float32Array {
  const scene = new Float32Array(pixels * 3);
  for (let index = 0; index < pixels; index += 1) {
    scene.set(value, index * 3);
  }
  return scene;
}

function quantized(value: readonly [number, number, number], exposure = 0): number[] {
  return displayEncode(value, exposure).map((channel) => Math.round(channel * 255));
}

function pixelAt(pixels: Uint8ClampedArray, column: number, row: number, width = size.width) {
  const offset = (row * width + column) * 4;
  return [...pixels.subarray(offset, offset + 4)];
}

describe('ditherNoise', () => {
  it('is the sum of two hashed unit floats minus one', () => {
    expect(ditherNoise(5, 9)).toBe(
      unitFloat(hash3(5, 9, 0, 101)) + unitFloat(hash3(5, 9, 1, 202)) - 1,
    );
  });

  it('is triangular noise with zero mean and variance one sixth', () => {
    let sum = 0;
    let squares = 0;
    const edge = 96;
    for (let row = 0; row < edge; row += 1) {
      for (let column = 0; column < edge; column += 1) {
        const noise = ditherNoise(column, row);
        expect(Math.abs(noise)).toBeLessThan(1);
        sum += noise;
        squares += noise * noise;
      }
    }
    const count = edge * edge;
    expect(Math.abs(sum / count)).toBeLessThan(0.02);
    expect(squares / count).toBeCloseTo(1 / 6, 1);
  });
});

describe('encodeFrame without bloom and dither', () => {
  const value = [0.8, 0.3, 0.1] as const;
  const scene = uniformScene(value);

  it('applies the tone map and the sRGB transfer to every pixel', () => {
    const pixels = encodeFrame(scene, null, plain, size, { dither: false });
    expect(pixels).toHaveLength(size.width * size.height * 4);
    for (const [column, row] of [
      [0, 0],
      [3, 2],
      [7, 5],
    ] as const) {
      expect(pixelAt(pixels, column, row)).toEqual([...quantized(value), 255]);
    }
  });

  it('follows the exposure in stops', () => {
    const brighter = encodeFrame(scene, null, mergeSettings(plain, { exposure: 1 }), size, {
      dither: false,
    });
    expect(pixelAt(brighter, 1, 1)).toEqual([...quantized(value, 1), 255]);
    const darker = encodeFrame(scene, null, mergeSettings(plain, { exposure: -2 }), size, {
      dither: false,
    });
    expect(pixelAt(darker, 1, 1)).toEqual([...quantized(value, -2), 255]);
  });

  it('keeps every pixel its own value when neighbours differ', () => {
    const alternating = new Float32Array(size.width * size.height * 3);
    const first = [0.9, 0.1, 0.1] as const;
    const second = [0.05, 0.6, 0.3] as const;
    for (let index = 0; index < size.width * size.height; index += 1) {
      alternating.set(index % 3 === 0 ? first : second, index * 3);
    }
    const pixels = encodeFrame(alternating, null, plain, size, { dither: false });
    for (let index = 0; index < size.width * size.height; index += 1) {
      const offset = index * 4;
      expect([...pixels.subarray(offset, offset + 3)]).toEqual(
        quantized(index % 3 === 0 ? first : second),
      );
    }
  });

  it('writes black for a black scene and opaque alpha everywhere', () => {
    const pixels = encodeFrame(uniformScene([0, 0, 0]), null, plain, size, { dither: false });
    expect(
      pixels.every((channel, index) => (index % 4 === 3 ? channel === 255 : channel === 0)),
    ).toBe(true);
  });
});

describe('encodeFrame with bloom', () => {
  const glow: RgbImage = { width: 4, height: 3, data: new Float32Array(4 * 3 * 3).fill(2) };
  const scene = uniformScene([0.2, 0.2, 0.2]);

  it('adds the glow scaled by the bloom strength before the tone map', () => {
    const settings = mergeSettings(defaultSettings, { bloomStrength: 0.25, exposure: 0 });
    const pixels = encodeFrame(scene, glow, settings, size, { dither: false });
    expect(pixelAt(pixels, 4, 3)).toEqual([...quantized([0.7, 0.7, 0.7]), 255]);
  });

  it('ignores the glow at zero strength', () => {
    const pixels = encodeFrame(scene, glow, plain, size, { dither: false });
    expect(pixelAt(pixels, 4, 3)).toEqual([...quantized([0.2, 0.2, 0.2]), 255]);
  });

  it('interpolates the glow between its texels', () => {
    const ramp: RgbImage = {
      width: 2,
      height: 1,
      data: Float32Array.from([0, 0, 0, 4, 4, 4]),
    };
    const settings = mergeSettings(defaultSettings, { bloomStrength: 0.5, exposure: 0 });
    const flat = uniformScene([0, 0, 0]);
    const pixels = encodeFrame(flat, ramp, settings, size, { dither: false });
    const left = pixelAt(pixels, 0, 0)[0] ?? 0;
    const middle = pixelAt(pixels, 3, 0)[0] ?? 0;
    const right = pixelAt(pixels, 7, 0)[0] ?? 0;
    expect(left).toBeLessThan(middle);
    expect(middle).toBeLessThan(right);
    expect(right).toBeGreaterThan(100);
  });
});

describe('encodeFrame dither', () => {
  const grey = uniformScene([0.18, 0.18, 0.18], 32 * 32);
  const wide = { width: 32, height: 32 };

  it('moves each channel by at most one level and keeps the unrounded value on average', () => {
    const flat = encodeFrame(grey, null, plain, wide, { dither: false });
    const dithered = encodeFrame(grey, null, plain, wide, { dither: true });
    const exact = displayEncode([0.18, 0.18, 0.18], 0).map((channel) => channel * 255);
    const sums = [0, 0, 0];
    let changed = 0;
    for (let pixel = 0; pixel < wide.width * wide.height; pixel += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const index = pixel * 4 + channel;
        const difference = (dithered[index] ?? 0) - (flat[index] ?? 0);
        expect(Math.abs(difference)).toBeLessThanOrEqual(1);
        sums[channel] = (sums[channel] ?? 0) + (dithered[index] ?? 0);
        changed += difference === 0 ? 0 : 1;
      }
    }
    expect(changed).toBeGreaterThan(100);
    sums.forEach((sum, channel) => {
      expect(Math.abs(sum / (wide.width * wide.height) - (exact[channel] ?? 0))).toBeLessThan(0.1);
    });
  });

  it('uses the same offset for the three channels of a pixel', () => {
    const flat = encodeFrame(grey, null, plain, wide, { dither: false });
    const dithered = encodeFrame(grey, null, plain, wide, { dither: true });
    for (let pixel = 0; pixel < 32 * 32; pixel += 1) {
      const offset = pixel * 4;
      const red = (dithered[offset] ?? 0) - (flat[offset] ?? 0);
      expect((dithered[offset + 1] ?? 0) - (flat[offset + 1] ?? 0)).toBe(red);
      expect((dithered[offset + 2] ?? 0) - (flat[offset + 2] ?? 0)).toBe(red);
    }
  });

  it('is repeatable', () => {
    expect(encodeFrame(grey, null, plain, wide, { dither: true })).toEqual(
      encodeFrame(grey, null, plain, wide, { dither: true }),
    );
  });
});

describe('encodeFrame overlays', () => {
  const wide = { width: 64, height: 64 };
  const dark = uniformScene([0, 0, 0], 64 * 64);

  it('paints the divider line into the encoded image', () => {
    const settings = mergeSettings(plain, { split: { enabled: true, position: 0.5 } });
    const pixels = encodeFrame(dark, null, settings, wide, { dither: false });
    expect(pixelAt(pixels, 31, 5, 64).slice(0, 3)).toEqual([255, 255, 255]);
    expect(pixelAt(pixels, 5, 5, 64).slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('paints the shadow edge ring in green over the encoded image', () => {
    const settings = mergeSettings(plain, { overlays: { shadowEdge: true } });
    const pixels = encodeFrame(dark, null, settings, wide, { dither: false });
    let ringPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if ((pixels[index + 1] ?? 0) > 100) {
        ringPixels += 1;
      }
    }
    expect(ringPixels).toBeGreaterThan(30);
    expect(pixelAt(pixels, 0, 0, 64).slice(0, 3)).toEqual([0, 0, 0]);
  });
});
