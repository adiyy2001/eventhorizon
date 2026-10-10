import { displayEncode } from '../color/tonemap';
import { channelsPerSample } from './cpu-frame';
import { FrameAssembler } from './frame-assembler';
import { defaultSettings, mergeSettings } from './settings';
import { type TileRequest } from './tile-scheduler';

const size = { width: 8, height: 8 };
const coarseTile: TileRequest = { pass: 0, step: 4, column: 0, row: 0, columns: 8, rows: 8 };
const plain = mergeSettings(defaultSettings, { bloomStrength: 0, exposure: 0 });

function pixelAt(pixels: Uint8ClampedArray, column: number, row: number, width = size.width) {
  const offset = (row * width + column) * 4;
  return [...pixels.subarray(offset, offset + 4)];
}

function shown(radiance: readonly [number, number, number]): number[] {
  return [...displayEncode(radiance, 0).map((channel) => Math.round(channel * 255)), 255];
}

function samples(...values: number[]): Float32Array {
  return Float32Array.from(values);
}

describe('FrameAssembler', () => {
  it('fills the block of each sample with its radiance', () => {
    const assembler = new FrameAssembler(size);
    assembler.applyTile(
      coarseTile,
      samples(0.5, 0.2, 0.1, 0.1, 0.1, 0.4, 2, 1, 0.5, 0.3, 0.3, 0.3),
    );
    const pixels = assembler.display(plain, 'preview');
    expect(pixelAt(pixels, 0, 0)).toEqual(shown([0.5, 0.2, 0.1]));
    expect(pixelAt(pixels, 3, 3)).toEqual(shown([0.5, 0.2, 0.1]));
    expect(pixelAt(pixels, 4, 0)).toEqual(shown([0.1, 0.1, 0.4]));
    expect(pixelAt(pixels, 3, 4)).toEqual(shown([2, 1, 0.5]));
    expect(pixelAt(pixels, 7, 7)).toEqual(shown([0.3, 0.3, 0.3]));
  });

  it('lets a finer pass overwrite a part of a coarse block', () => {
    const assembler = new FrameAssembler(size);
    assembler.applyTile(coarseTile, new Float32Array(12).fill(0.2));
    const fine: TileRequest = { pass: 1, step: 2, column: 0, row: 0, columns: 4, rows: 4 };
    assembler.applyTile(fine, new Float32Array(9).fill(1));
    const pixels = assembler.display(plain, 'preview');
    expect(pixelAt(pixels, 2, 0)).toEqual(shown([1, 1, 1]));
    expect(pixelAt(pixels, 3, 1)).toEqual(shown([1, 1, 1]));
    expect(pixelAt(pixels, 0, 0)).toEqual(shown([0.2, 0.2, 0.2]));
    expect(pixelAt(pixels, 1, 1)).toEqual(shown([0.2, 0.2, 0.2]));
    expect(pixelAt(pixels, 4, 0)).toEqual(shown([0.2, 0.2, 0.2]));
  });

  it('keeps finer samples when a coarse tile arrives late', () => {
    const assembler = new FrameAssembler(size);
    const fine: TileRequest = { pass: 1, step: 2, column: 0, row: 0, columns: 4, rows: 4 };
    assembler.applyTile(fine, new Float32Array(9).fill(1));
    assembler.applyTile(coarseTile, new Float32Array(12).fill(0.2));
    const pixels = assembler.display(plain, 'preview');
    expect(pixelAt(pixels, 2, 0)).toEqual(shown([1, 1, 1]));
    expect(pixelAt(pixels, 3, 3)).toEqual(shown([1, 1, 1]));
    expect(pixelAt(pixels, 0, 0)).toEqual(shown([0.2, 0.2, 0.2]));
    expect(pixelAt(pixels, 1, 1)).toEqual(shown([0.2, 0.2, 0.2]));
    expect(pixelAt(pixels, 4, 0)).toEqual(shown([0.2, 0.2, 0.2]));
  });

  it('accepts a tile twice and keeps the latest values of the same step', () => {
    const assembler = new FrameAssembler(size);
    assembler.applyTile(coarseTile, new Float32Array(12).fill(0.2));
    assembler.applyTile(coarseTile, new Float32Array(12).fill(0.6));
    expect(pixelAt(assembler.display(plain, 'preview'), 5, 5)).toEqual(shown([0.6, 0.6, 0.6]));
  });

  it('clips blocks at the edge of an image that is not a multiple of the step', () => {
    const odd = new FrameAssembler({ width: 5, height: 5 });
    const tile: TileRequest = { pass: 0, step: 4, column: 0, row: 0, columns: 5, rows: 5 };
    odd.applyTile(tile, new Float32Array(12).fill(0.4));
    const pixels = odd.display(plain, 'preview');
    expect(pixelAt(pixels, 4, 4, 5)).toEqual(shown([0.4, 0.4, 0.4]));
    expect(pixels).toHaveLength(5 * 5 * 4);
  });

  it('rejects a buffer of the wrong length', () => {
    const assembler = new FrameAssembler(size);
    expect(() => {
      assembler.applyTile(coarseTile, new Float32Array(5));
    }).toThrow(RangeError);
  });

  it('keeps the assembled radiance free of overlays', () => {
    const assembler = new FrameAssembler({ width: 32, height: 32 });
    const wide: TileRequest = { pass: 0, step: 8, column: 0, row: 0, columns: 32, rows: 32 };
    assembler.applyTile(wide, new Float32Array(48));
    const before = assembler.display(plain, 'preview');
    const marked = assembler.display(
      mergeSettings(plain, {
        split: { enabled: true, position: 0.5 },
        overlays: { shadowEdge: true },
      }),
      'preview',
    );
    expect(before.every((value, index) => index % 4 === 3 || value === 0)).toBe(true);
    expect(marked.some((value, index) => index % 4 !== 3 && value > 0)).toBe(true);
    expect(assembler.display(plain, 'preview')).toEqual(before);
  });

  it('re-displays the same radiance with another exposure', () => {
    const assembler = new FrameAssembler(size);
    assembler.applyTile(coarseTile, new Float32Array(12).fill(0.1));
    const dim = assembler.display(plain, 'preview');
    const bright = assembler.display(mergeSettings(plain, { exposure: 2 }), 'preview');
    expect(pixelAt(bright, 0, 0)[0]).toBeGreaterThan(pixelAt(dim, 0, 0)[0] ?? 0);
  });
});

describe('FrameAssembler display quality', () => {
  const wide = { width: 64, height: 64 };
  const bloomy = mergeSettings(defaultSettings, { bloomStrength: 0.4, exposure: 0 });

  function assembleBrightSpot(): FrameAssembler {
    const assembler = new FrameAssembler(wide);
    const tile: TileRequest = { pass: 0, step: 8, column: 0, row: 0, columns: 64, rows: 64 };
    const values = new Float32Array(64 * channelsPerSample);
    values.set([30, 30, 30], (3 * 8 + 3) * channelsPerSample);
    assembler.applyTile(tile, values);
    return assembler;
  }

  it('leaves out the bloom and the dither in a preview', () => {
    const assembler = assembleBrightSpot();
    const preview = assembler.display(bloomy, 'preview');
    expect(pixelAt(preview, 28, 28, 64)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(preview, 36, 28, 64)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(preview, 0, 0, 64)).toEqual([0, 0, 0, 255]);
  });

  it('adds the glow around bright light and the dither noise in the final image', () => {
    const assembler = assembleBrightSpot();
    const final = assembler.display(bloomy, 'final');
    const nearby = pixelAt(final, 36, 28, 64);
    expect(nearby[0]).toBeGreaterThan(10);
    expect(nearby[2]).toBeGreaterThan(10);
    const far = pixelAt(final, 62, 62, 64);
    expect(far[0]).toBeLessThan(nearby[0] ?? 0);
  });

  it('reuses the glow for another exposure and refreshes it after a new tile', () => {
    const assembler = assembleBrightSpot();
    const first = assembler.display(bloomy, 'final');
    expect(assembler.display(bloomy, 'final')).toEqual(first);
    const brighter = assembler.display(mergeSettings(bloomy, { exposure: 1 }), 'final');
    expect(pixelAt(brighter, 36, 28, 64)[0]).toBeGreaterThanOrEqual(
      pixelAt(first, 36, 28, 64)[0] ?? 0,
    );
    const fine: TileRequest = { pass: 1, step: 4, column: 0, row: 0, columns: 64, rows: 64 };
    const extra = new Float32Array(192 * channelsPerSample).fill(0);
    assembler.applyTile(fine, extra);
    const second = assembler.display(bloomy, 'final');
    expect(second).not.toEqual(first);
  });
});
