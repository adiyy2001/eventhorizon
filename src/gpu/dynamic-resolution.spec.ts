import {
  advanceResolution,
  beginMotion,
  defaultResolutionConfig,
  initialResolutionState,
  quantizeScale,
  type ResolutionState,
} from './dynamic-resolution';

const config = defaultResolutionConfig;
const vsyncMs = config.targetMs;

interface Run {
  scales: number[];
  state: ResolutionState;
}

function simulate(
  frames: number,
  costAtFullMs: (frame: number) => number,
  direct: boolean,
  start: ResolutionState = initialResolutionState(),
): Run {
  let state = start;
  const scales: number[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    const gpuMs = costAtFullMs(frame) * state.scale * state.scale;
    const frameMs = Math.max(vsyncMs, gpuMs);
    state = advanceResolution(
      state,
      { frameMs, gpuMs: direct ? gpuMs : null, moving: true },
      config,
    );
    scales.push(state.scale);
  }
  return { scales, state };
}

function changesIn(scales: readonly number[]): number {
  let changes = 0;
  for (let index = 1; index < scales.length; index += 1) {
    if (scales[index] !== scales[index - 1]) {
      changes += 1;
    }
  }
  return changes;
}

describe('quantizeScale', () => {
  it('rounds down to a multiple of the step above the minimum', () => {
    expect(quantizeScale(0.527, config)).toBeCloseTo(0.5, 9);
    expect(quantizeScale(0.55, config)).toBeCloseTo(0.55, 9);
    expect(quantizeScale(0.549999, config)).toBeCloseTo(0.5, 9);
  });

  it('clamps to the allowed scale range', () => {
    expect(quantizeScale(0.01, config)).toBe(config.minScale);
    expect(quantizeScale(7, config)).toBe(config.maxScale);
  });

  it('allows the maximum exactly', () => {
    expect(quantizeScale(1, config)).toBeCloseTo(1, 9);
  });
});

describe('resolution controller with direct GPU timing', () => {
  it('stays at full resolution when the frame fits the budget', () => {
    const { scales } = simulate(120, () => 6, true);
    expect(new Set(scales)).toEqual(new Set([1]));
  });

  it('drops until the frame fits and then stops changing', () => {
    const { scales } = simulate(300, () => 60, true);
    const settled = scales[scales.length - 1] ?? 0;
    expect(settled).toBeLessThan(1);
    expect(settled).toBeGreaterThanOrEqual(config.minScale);
    expect(60 * settled * settled).toBeLessThanOrEqual(config.targetMs * (1 + config.tolerance));
    expect(changesIn(scales.slice(30))).toBe(0);
  });

  it('settles within a few frames', () => {
    const { scales } = simulate(40, () => 60, true);
    expect(changesIn(scales)).toBeLessThanOrEqual(2);
  });

  it('never goes below the minimum when the frame is hopelessly slow', () => {
    const { scales } = simulate(200, () => 4000, true);
    expect(Math.min(...scales)).toBe(config.minScale);
    expect(changesIn(scales.slice(20))).toBe(0);
  });

  it('rises again when the cost falls', () => {
    const { scales } = simulate(400, (frame) => (frame < 100 ? 80 : 8), true);
    expect(scales[99]).toBeLessThan(0.6);
    expect(scales[399]).toBe(1);
  });

  it('ignores noise inside the tolerance band without oscillating', () => {
    let seed = 7;
    const noisy = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return 1 + 0.04 * (seed / 2147483648 - 0.5);
    };
    let state = initialResolutionState();
    const scales: number[] = [];
    for (let frame = 0; frame < 600; frame += 1) {
      const gpuMs = 40 * state.scale * state.scale * noisy();
      state = advanceResolution(state, { frameMs: Math.max(vsyncMs, gpuMs), gpuMs, moving: true });
      scales.push(state.scale);
    }
    expect(changesIn(scales.slice(60))).toBeLessThanOrEqual(2);
  });
});

describe('resolution controller with frame deltas only', () => {
  it('drops under load and settles', () => {
    const { scales } = simulate(300, () => 60, false);
    const settled = scales[scales.length - 1] ?? 0;
    expect(settled).toBeLessThan(0.7);
    expect(settled).toBeGreaterThanOrEqual(config.minScale);
    expect(vsyncMs).toBeLessThan(60 * settled * settled * 1.2);
  });

  it('finds headroom by probing upwards and backs off after a failed probe', () => {
    const slow = simulate(120, () => 60, false);
    const recovered = simulate(1200, () => 8, false, {
      ...slow.state,
      probeAfterFrames: config.probeAfterFrames,
    });
    expect(recovered.scales[recovered.scales.length - 1]).toBe(1);
  });

  it('probes less often after each failed probe', () => {
    const run = simulate(3000, () => 60, false);
    const dropsAfterWarmup = run.scales
      .slice(1, -1)
      .filter((scale, index) => scale < (run.scales[index] ?? 0)).length;
    expect(dropsAfterWarmup).toBeLessThan(20);
    expect(run.state.probeAfterFrames).toBeGreaterThan(config.probeAfterFrames);
  });

  it('keeps a stable scale when nothing changes and nothing probes', () => {
    const state: ResolutionState = {
      ...initialResolutionState(),
      scale: 0.5,
      probeAfterFrames: config.maxProbeAfterFrames,
    };
    const { scales } = simulate(100, () => 60, false, state);
    expect(changesIn(scales)).toBe(0);
  });
});

describe('rest and motion', () => {
  it('restores full resolution as soon as the camera rests', () => {
    const moving = simulate(100, () => 80, true);
    expect(moving.state.scale).toBeLessThan(1);
    const resting = advanceResolution(moving.state, { frameMs: 100, gpuMs: 100, moving: false });
    expect(resting.scale).toBe(1);
    expect(resting.fullCostMs).toBe(moving.state.fullCostMs);
  });

  it('starts the next motion at the remembered scale', () => {
    const moving = simulate(100, () => 80, true);
    const resting = advanceResolution(moving.state, { frameMs: 100, gpuMs: 100, moving: false });
    const again = beginMotion(resting);
    expect(again.scale).toBeCloseTo(moving.state.scale, 9);
  });

  it('begins at full resolution when nothing is known yet', () => {
    expect(beginMotion(initialResolutionState()).scale).toBe(1);
  });

  it('logs a drop and a recovery for a short move and stop sequence', () => {
    let state = initialResolutionState();
    const scales: number[] = [];
    for (let frame = 0; frame < 160; frame += 1) {
      const moving = frame >= 20 && frame < 100;
      if (moving && frame === 20) {
        state = beginMotion(state);
      }
      const gpuMs = 70 * state.scale * state.scale;
      state = advanceResolution(state, { frameMs: Math.max(vsyncMs, gpuMs), gpuMs, moving });
      scales.push(state.scale);
    }
    expect(scales[10]).toBe(1);
    expect(Math.min(...scales.slice(20, 100))).toBeLessThan(0.6);
    expect(scales[159]).toBe(1);
  });
});
