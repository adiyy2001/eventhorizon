import { fbm3, valueNoise3 } from './noise';

describe('value noise', () => {
  it('stays within [0, 1]', () => {
    for (let index = 0; index < 2000; index += 1) {
      const value = valueNoise3(index * 0.173 - 50, index * 0.071 + 3, index * 0.31 - 7, 5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('equals the lattice value at integer points and is continuous around them', () => {
    const at = valueNoise3(4, -3, 9, 2);
    expect(valueNoise3(4 + 1e-6, -3, 9, 2)).toBeCloseTo(at, 4);
    expect(valueNoise3(4 - 1e-6, -3, 9, 2)).toBeCloseTo(at, 4);
  });

  it('changes with the seed', () => {
    expect(valueNoise3(0.5, 0.5, 0.5, 1)).not.toBe(valueNoise3(0.5, 0.5, 0.5, 2));
  });
});

describe('fractal noise', () => {
  it('stays within [0, 1] and has a mean near one half', () => {
    let total = 0;
    const count = 4000;
    for (let index = 0; index < count; index += 1) {
      const value = fbm3(index * 0.0137, Math.sin(index) * 3, Math.cos(index * 0.7) * 3, 9);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      total += value;
    }
    expect(total / count).toBeCloseTo(0.5, 1);
  });

  it('varies smoothly over small steps', () => {
    const first = fbm3(0.3, 0.4, 0.5, 3);
    const second = fbm3(0.3001, 0.4, 0.5, 3);
    expect(Math.abs(first - second)).toBeLessThan(1e-2);
  });
});
