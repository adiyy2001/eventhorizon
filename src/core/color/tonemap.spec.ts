import {
  acesFitted,
  acesFittedInto,
  displayEncode,
  displayEncodeInto,
  exposureScale,
} from './tonemap';
import { linearToSrgbTransfer, type MutableRgb, type Rgb } from './xyz-srgb';

describe('ACES fitted tone mapping', () => {
  it('maps black to black', () => {
    const black = acesFitted([0, 0, 0]);
    for (const channel of black) {
      expect(channel).toBeCloseTo(0, 3);
    }
  });

  it('is monotonic and bounded by one', () => {
    let previous = -1;
    for (const value of [0.01, 0.1, 0.5, 1, 2, 4]) {
      const mapped = acesFitted([value, value, value]);
      expect(mapped[1]).toBeGreaterThan(previous);
      expect(mapped[1]).toBeLessThanOrEqual(1);
      previous = mapped[1];
    }
  });

  it('clamps very large input to one', () => {
    expect(acesFitted([1e4, 1e4, 1e4])).toEqual([1, 1, 1]);
  });

  it('matches hand evaluated values of the published fit', () => {
    const grey = acesFitted([0.18, 0.18, 0.18]);
    expect(grey[0]).toBeCloseTo(0.1056, 3);
    expect(grey[1]).toBeCloseTo(0.1056, 3);
    expect(grey[2]).toBeCloseTo(0.1056, 3);
    const one = acesFitted([1, 1, 1]);
    expect(one[1]).toBeCloseTo(0.6191, 3);
  });

  it('desaturates very bright saturated input towards white', () => {
    const mapped = acesFitted([400, 40, 4]);
    expect(mapped[0]).toBeCloseTo(1, 2);
    expect(mapped[1]).toBeGreaterThan(0.8);
  });
});

describe('display encoding', () => {
  it('doubles the input for every stop of exposure', () => {
    expect(exposureScale(0)).toBe(1);
    expect(exposureScale(2)).toBe(4);
    expect(exposureScale(-1)).toBe(0.5);
  });

  it('applies exposure before the curve and the sRGB transfer after it', () => {
    const base = displayEncode([0.25, 0.25, 0.25], 0);
    const brighter = displayEncode([0.25, 0.25, 0.25], 1);
    const same = displayEncode([0.5, 0.5, 0.5], 0);
    expect(brighter[1]).toBeGreaterThan(base[1]);
    expect(brighter[1]).toBeCloseTo(same[1], 12);
    expect(base[1]).toBeGreaterThan(acesFitted([0.25, 0.25, 0.25])[1]);
  });
});

describe('allocation free variants', () => {
  const input = [
    [0.59719, 0.35458, 0.04823],
    [0.076, 0.90834, 0.01566],
    [0.0284, 0.13383, 0.83777],
  ];
  const output = [
    [1.60475, -0.53108, -0.07367],
    [-0.10208, 1.10813, -0.00605],
    [-0.00327, -0.07276, 1.07602],
  ];

  function multiply(matrix: number[][], color: readonly number[]): number[] {
    return matrix.map(
      (row) =>
        (row[0] ?? 0) * (color[0] ?? 0) +
        (row[1] ?? 0) * (color[1] ?? 0) +
        (row[2] ?? 0) * (color[2] ?? 0),
    );
  }

  function plainAces(color: Rgb): number[] {
    const curved = multiply(input, color).map((value) => {
      const numerator = value * (value + 0.0245786) - 0.000090537;
      const denominator = value * (0.983729 * value + 0.432951) + 0.238081;
      return numerator / denominator;
    });
    return multiply(output, curved).map((value) => Math.min(Math.max(value, 0), 1));
  }

  const colors: Rgb[] = [
    [0, 0, 0],
    [0.02, 0.5, 3],
    [1, 1, 1],
    [40, 4, 0.4],
    [0.001, 0.0004, 0.2],
  ];

  it('tone maps like a plain matrix implementation of the published fit', () => {
    for (const color of colors) {
      const target: MutableRgb = [9, 9, 9];
      acesFittedInto(target, color[0], color[1], color[2]);
      plainAces(color).forEach((expected, channel) => {
        expect(target[channel]).toBeCloseTo(expected, 12);
      });
    }
  });

  it('encodes with a precomputed exposure scale exactly like the returning function', () => {
    for (const color of colors) {
      for (const stops of [-2, 0, 1.5]) {
        const target: MutableRgb = [9, 9, 9];
        displayEncodeInto(target, color[0], color[1], color[2], exposureScale(stops));
        const expected = plainAces([
          color[0] * 2 ** stops,
          color[1] * 2 ** stops,
          color[2] * 2 ** stops,
        ]);
        expected.forEach((linear, channel) => {
          expect(target[channel]).toBeCloseTo(linearToSrgbTransfer(linear), 12);
        });
        expect(displayEncode(color, stops)).toEqual(target);
      }
    }
  });

  it('overwrites the whole target', () => {
    const target: MutableRgb = [-5, -5, -5];
    displayEncodeInto(target, 0, 0, 0, 1);
    expect(target).toEqual([0, 0, 0]);
  });
});
