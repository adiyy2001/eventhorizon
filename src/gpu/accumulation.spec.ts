import { historyWeight, jitterForFrame } from './accumulation';

describe('jitter sequence', () => {
  it('starts at the pixel center', () => {
    expect(jitterForFrame(0)).toEqual({ x: 0, y: 0 });
  });

  it('stays inside the pixel footprint', () => {
    for (let index = 0; index < 5000; index += 1) {
      const { x, y } = jitterForFrame(index);
      expect(x).toBeGreaterThanOrEqual(-0.5);
      expect(x).toBeLessThan(0.5);
      expect(y).toBeGreaterThanOrEqual(-0.5);
      expect(y).toBeLessThan(0.5);
    }
  });

  it('covers the pixel evenly: every quarter holds about a quarter of 1024 samples', () => {
    const quarters = [0, 0, 0, 0];
    for (let index = 0; index < 1024; index += 1) {
      const { x, y } = jitterForFrame(index);
      const slot = (x < 0 ? 0 : 1) + (y < 0 ? 0 : 2);
      quarters[slot] = (quarters[slot] ?? 0) + 1;
    }
    for (const count of quarters) {
      expect(Math.abs(count - 256)).toBeLessThan(16);
    }
  });

  it('has a mean near the pixel center', () => {
    let sumX = 0;
    let sumY = 0;
    const count = 2048;
    for (let index = 0; index < count; index += 1) {
      const { x, y } = jitterForFrame(index);
      sumX += x;
      sumY += y;
    }
    expect(Math.abs(sumX / count)).toBeLessThan(0.01);
    expect(Math.abs(sumY / count)).toBeLessThan(0.01);
  });

  it('never repeats a sample in the first thousand frames', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      const { x, y } = jitterForFrame(index);
      seen.add(`${x.toFixed(9)},${y.toFixed(9)}`);
    }
    expect(seen.size).toBe(1000);
  });
});

describe('history weight', () => {
  it('replaces the history on the first frame and averages afterwards', () => {
    expect(historyWeight(0)).toBe(1);
    expect(historyWeight(1)).toBe(0.5);
    expect(historyWeight(3)).toBe(0.25);
  });

  it('turns a sequence of samples into their running mean', () => {
    const samples = [3, 7, 11, 2, 9];
    let average = 0;
    samples.forEach((sample, count) => {
      const weight = historyWeight(count);
      average = average * (1 - weight) + sample * weight;
    });
    expect(average).toBeCloseTo(
      samples.reduce((sum, value) => sum + value, 0) / samples.length,
      12,
    );
  });
});
