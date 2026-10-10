import { describe, expect, it } from 'vitest';
import { motionStatistics, percentile, summarize } from '../bench/frame-statistics.ts';

const entry = (
  frame: number,
  moving: boolean,
  scale: number,
  frameMs: number,
  gpuMs: number | null,
) => ({
  frame,
  moving,
  scale,
  frameMs,
  gpuMs,
});

describe('percentile', () => {
  it('picks the nearest rank of the sorted values', () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(percentile([7], 0.95)).toBe(7);
  });

  it('is not a number for no values', () => {
    expect(percentile([], 0.5)).toBeNaN();
  });
});

describe('summarize', () => {
  it('reports count, median, p95 and mean', () => {
    expect(summarize([10, 20, 30, 40])).toEqual({ count: 4, median: 20, p95: 40, mean: 25 });
  });

  it('is null without values', () => {
    expect(summarize([])).toBeNull();
  });
});

describe('motionStatistics', () => {
  const log = [
    entry(0, false, 1, 0, null),
    entry(1, false, 1, 16, null),
    entry(2, true, 1, 40, 30),
    entry(3, true, 0.8, 20, 18),
    entry(4, true, 0.6, 10, 8),
    entry(5, false, 1, 16, null),
  ];

  it('counts moving and resting frames and takes the median of the moving ones', () => {
    const statistics = motionStatistics(log);
    expect(statistics.movingFrames).toBe(3);
    expect(statistics.restFrames).toBe(3);
    expect(statistics.frameMilliseconds?.median).toBe(20);
    expect(statistics.framesPerSecondAtMedian).toBe(50);
    expect(statistics.gpuMilliseconds?.median).toBe(18);
    expect(statistics.scale?.mean).toBeCloseTo(0.8, 12);
  });

  it('has no rates when nothing moved', () => {
    const statistics = motionStatistics([entry(0, false, 1, 16, null)]);
    expect(statistics.frameMilliseconds).toBeNull();
    expect(statistics.framesPerSecondAtMedian).toBeNull();
    expect(statistics.gpuMilliseconds).toBeNull();
  });

  it('leaves the gpu summary empty when no timestamps exist', () => {
    const statistics = motionStatistics([entry(0, true, 1, 16, null)]);
    expect(statistics.gpuMilliseconds).toBeNull();
    expect(statistics.frameMilliseconds?.median).toBe(16);
  });
});
