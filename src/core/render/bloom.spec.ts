import { bloomLevelSizes, computeGlow, maxBloomLevels, sampleImage, type RgbImage } from './bloom';

function filled(width: number, height: number, value: readonly [number, number, number]) {
  const data = new Float32Array(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    data.set(value, index * 3);
  }
  return data;
}

function glowAt(glow: RgbImage, column: number, row: number, channel = 0): number {
  return glow.data[(row * glow.width + column) * 3 + channel] ?? Number.NaN;
}

describe('bloomLevelSizes', () => {
  it('halves the size five times for a large image', () => {
    expect(bloomLevelSizes({ width: 512, height: 512 })).toEqual([
      { width: 256, height: 256 },
      { width: 128, height: 128 },
      { width: 64, height: 64 },
      { width: 32, height: 32 },
      { width: 16, height: 16 },
    ]);
    expect(bloomLevelSizes({ width: 512, height: 512 })).toHaveLength(maxBloomLevels);
  });

  it('stops before a level gets narrower than four texels', () => {
    expect(bloomLevelSizes({ width: 100, height: 60 })).toEqual([
      { width: 50, height: 30 },
      { width: 25, height: 15 },
      { width: 12, height: 7 },
    ]);
  });

  it('keeps one texel for an image too small to be reduced', () => {
    expect(bloomLevelSizes({ width: 6, height: 6 })).toEqual([{ width: 1, height: 1 }]);
    expect(bloomLevelSizes({ width: 1, height: 1 })).toEqual([{ width: 1, height: 1 }]);
  });
});

describe('sampleImage', () => {
  const image: RgbImage = {
    width: 2,
    height: 2,
    data: Float32Array.from([0, 0, 0, 4, 8, 12, 8, 16, 24, 12, 24, 36]),
  };

  function sample(u: number, v: number): number[] {
    const target = new Float64Array(3);
    sampleImage(image, u, v, target, 0);
    return [...target];
  }

  it('returns the texel value at a texel centre', () => {
    expect(sample(0.25, 0.25)).toEqual([0, 0, 0]);
    expect(sample(0.75, 0.25)).toEqual([4, 8, 12]);
    expect(sample(0.25, 0.75)).toEqual([8, 16, 24]);
  });

  it('averages the four texels in the middle of the image', () => {
    expect(sample(0.5, 0.5)).toEqual([6, 12, 18]);
  });

  it('interpolates linearly between two texel centres', () => {
    expect(sample(0.5, 0.25)).toEqual([2, 4, 6]);
  });

  it('repeats the edge texel outside the image', () => {
    expect(sample(0, 0)).toEqual([0, 0, 0]);
    expect(sample(1, 1)).toEqual([12, 24, 36]);
  });

  it('writes at the requested offset of the target', () => {
    const target = new Float64Array(6).fill(-1);
    sampleImage(image, 0.75, 0.75, target, 3);
    expect([...target]).toEqual([-1, -1, -1, 12, 24, 36]);
  });
});

describe('computeGlow', () => {
  it('turns a uniform image into one damped copy per level', () => {
    const size = { width: 128, height: 128 };
    const levels = bloomLevelSizes(size).length;
    const glow = computeGlow(filled(128, 128, [1, 1, 1]), size);
    const dampedGrey = 1 / (1 + 1);
    expect(glow.width).toBe(64);
    expect(glow.height).toBe(64);
    for (const [column, row] of [
      [0, 0],
      [31, 40],
      [63, 63],
    ] as const) {
      expect(glowAt(glow, column, row)).toBeCloseTo(levels * dampedGrey, 5);
    }
  });

  it('damps bright pixels: a hundred times the input gives far less than a hundred times the glow', () => {
    const size = { width: 64, height: 64 };
    const dim = filled(64, 64, [0, 0, 0]);
    const bright = filled(64, 64, [0, 0, 0]);
    dim.set([1, 1, 1], (32 * 64 + 32) * 3);
    bright.set([100, 100, 100], (32 * 64 + 32) * 3);
    const dimGlow = computeGlow(dim, size);
    const brightGlow = computeGlow(bright, size);
    const ratio = glowAt(brightGlow, 16, 16) / glowAt(dimGlow, 16, 16);
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(25);
  });

  it('spreads a light source symmetrically around it', () => {
    const size = { width: 64, height: 64 };
    const scene = filled(64, 64, [0, 0, 0]);
    for (const [column, row] of [
      [31, 31],
      [32, 31],
      [31, 32],
      [32, 32],
    ] as const) {
      scene.set([20, 20, 20], (row * 64 + column) * 3);
    }
    const glow = computeGlow(scene, size);
    const last = glow.width - 1;
    for (const [column, row] of [
      [3, 5],
      [10, 16],
      [14, 14],
    ] as const) {
      const value = glowAt(glow, column, row);
      expect(value).toBeGreaterThan(0);
      expect(glowAt(glow, last - column, row)).toBeCloseTo(value, 5);
      expect(glowAt(glow, column, last - row)).toBeCloseTo(value, 5);
      expect(glowAt(glow, row, column)).toBeCloseTo(value, 5);
    }
  });

  it('is brightest at the source and fades with distance', () => {
    const size = { width: 64, height: 64 };
    const scene = filled(64, 64, [0, 0, 0]);
    scene.set([30, 30, 30], (32 * 64 + 32) * 3);
    const glow = computeGlow(scene, size);
    const centre = glowAt(glow, 16, 16);
    const near = glowAt(glow, 20, 16);
    const far = glowAt(glow, 30, 16);
    expect(centre).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it('keeps the colour channels apart', () => {
    const size = { width: 32, height: 32 };
    const scene = filled(32, 32, [0, 0, 0]);
    scene.set([0, 0, 40], (16 * 32 + 16) * 3);
    const glow = computeGlow(scene, size);
    expect(glowAt(glow, 8, 8, 0)).toBe(0);
    expect(glowAt(glow, 8, 8, 1)).toBe(0);
    expect(glowAt(glow, 8, 8, 2)).toBeGreaterThan(0);
  });

  it('works on an image that cannot be halved evenly', () => {
    const glow = computeGlow(filled(37, 21, [2, 1, 0.5]), { width: 37, height: 21 });
    expect(glow.width).toBe(18);
    expect(glow.height).toBe(10);
    expect(glow.data.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
  });

  it('returns a single texel for an image too small to be reduced', () => {
    const glow = computeGlow(filled(4, 4, [1, 1, 1]), { width: 4, height: 4 });
    expect(glow.width).toBe(1);
    expect(glow.height).toBe(1);
    expect(glowAt(glow, 0, 0)).toBeCloseTo(0.5, 5);
  });
});
