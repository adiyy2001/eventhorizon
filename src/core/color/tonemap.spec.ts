import { acesFitted, displayEncode, exposureScale } from './tonemap';

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
