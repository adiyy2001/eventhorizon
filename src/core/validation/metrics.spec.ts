import { maxOf, percentile, relativeError } from './metrics';

describe('metrics', () => {
  it('computes relative error against the reference', () => {
    expect(relativeError(1.1, 1)).toBeCloseTo(0.1, 15);
    expect(relativeError(-0.9, -1)).toBeCloseTo(0.1, 15);
  });

  it('finds the largest value and treats the empty list as zero', () => {
    expect(maxOf([0.5, 3, 2])).toBe(3);
    expect(maxOf([])).toBe(0);
  });

  it('picks percentiles from the sorted values', () => {
    const values = [9, 1, 5, 3, 7];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 0.5)).toBe(5);
    expect(percentile(values, 1)).toBe(9);
    expect(() => percentile([], 0.5)).toThrow(RangeError);
  });
});
