import { type ResolutionLogEntry } from '../src/gpu/dynamic-resolution';

export interface Summary {
  count: number;
  median: number;
  p95: number;
  mean: number;
}

export interface MotionStatistics {
  movingFrames: number;
  restFrames: number;
  frameMilliseconds: Summary | null;
  framesPerSecondAtMedian: number | null;
  gpuMilliseconds: Summary | null;
  scale: Summary | null;
}

export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const sorted = [...values].sort((first, second) => first - second);
  const position = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[position] ?? Number.NaN;
}

export function summarize(values: readonly number[]): Summary | null {
  if (values.length === 0) {
    return null;
  }
  return {
    count: values.length,
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

export function motionStatistics(log: readonly ResolutionLogEntry[]): MotionStatistics {
  const moving = log.filter((entry) => entry.moving && entry.frameMs > 0);
  const gpuSamples = moving.flatMap((entry) => (entry.gpuMs === null ? [] : [entry.gpuMs]));
  const frameMilliseconds = summarize(moving.map((entry) => entry.frameMs));
  return {
    movingFrames: moving.length,
    restFrames: log.filter((entry) => !entry.moving).length,
    frameMilliseconds,
    framesPerSecondAtMedian: frameMilliseconds === null ? null : 1000 / frameMilliseconds.median,
    gpuMilliseconds: summarize(gpuSamples),
    scale: summarize(moving.map((entry) => entry.scale)),
  };
}
