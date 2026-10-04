import { createMulberry32, uniformBetween } from './prng';

describe('createMulberry32', () => {
  it('repeats the same sequence for the same seed', () => {
    const first = createMulberry32(42);
    const second = createMulberry32(42);
    for (let index = 0; index < 100; index += 1) {
      expect(first()).toBe(second());
    }
  });

  it('differs between seeds and stays in the unit interval', () => {
    const left = createMulberry32(1);
    const right = createMulberry32(2);
    let different = 0;
    for (let index = 0; index < 100; index += 1) {
      const value = left();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      if (value !== right()) {
        different += 1;
      }
    }
    expect(different).toBeGreaterThan(95);
  });

  it('is roughly uniform', () => {
    const random = createMulberry32(7);
    let sum = 0;
    for (let index = 0; index < 20000; index += 1) {
      sum += random();
    }
    expect(sum / 20000).toBeGreaterThan(0.49);
    expect(sum / 20000).toBeLessThan(0.51);
  });

  it('maps to a range', () => {
    const random = createMulberry32(3);
    for (let index = 0; index < 100; index += 1) {
      const value = uniformBetween(random, 5, 9);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThan(9);
    }
  });
});
