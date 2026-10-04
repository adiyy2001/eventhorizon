export interface ResolutionConfig {
  targetMs: number;
  minScale: number;
  maxScale: number;
  step: number;
  smoothing: number;
  tolerance: number;
  probeAfterFrames: number;
  maxProbeAfterFrames: number;
}

export const defaultResolutionConfig: ResolutionConfig = {
  targetMs: 1000 / 60,
  minScale: 0.35,
  maxScale: 1,
  step: 0.05,
  smoothing: 0.3,
  tolerance: 0.12,
  probeAfterFrames: 24,
  maxProbeAfterFrames: 384,
};

export interface ResolutionState {
  scale: number;
  fullCostMs: number | null;
  calmFrames: number;
  probeAfterFrames: number;
  probing: boolean;
}

export interface ResolutionSample {
  frameMs: number;
  gpuMs: number | null;
  moving: boolean;
}

export function initialResolutionState(
  config: ResolutionConfig = defaultResolutionConfig,
): ResolutionState {
  return {
    scale: config.maxScale,
    fullCostMs: null,
    calmFrames: 0,
    probeAfterFrames: config.probeAfterFrames,
    probing: false,
  };
}

export function quantizeScale(value: number, config: ResolutionConfig): number {
  const steps = Math.floor((value - config.minScale) / config.step + 1e-6);
  const quantized = config.minScale + Math.max(0, steps) * config.step;
  return Math.min(config.maxScale, Math.max(config.minScale, Number(quantized.toFixed(6))));
}

function scaleForCost(fullCostMs: number, config: ResolutionConfig): number {
  return quantizeScale(Math.sqrt(config.targetMs / fullCostMs), config);
}

function smoothed(previous: number | null, sample: number, smoothing: number): number {
  return previous === null ? sample : previous + smoothing * (sample - previous);
}

export function beginMotion(
  state: ResolutionState,
  config: ResolutionConfig = defaultResolutionConfig,
): ResolutionState {
  if (state.fullCostMs === null) {
    return { ...state, scale: config.maxScale, calmFrames: 0, probing: false };
  }
  return { ...state, scale: scaleForCost(state.fullCostMs, config), calmFrames: 0, probing: false };
}

export function advanceResolution(
  state: ResolutionState,
  sample: ResolutionSample,
  config: ResolutionConfig = defaultResolutionConfig,
): ResolutionState {
  if (!sample.moving) {
    return { ...state, scale: config.maxScale, calmFrames: 0, probing: false };
  }
  const measuredMs = sample.gpuMs ?? sample.frameMs;
  const fullCostMs = smoothed(
    state.fullCostMs,
    measuredMs / (state.scale * state.scale),
    config.smoothing,
  );
  const overBudget = measuredMs > config.targetMs * (1 + config.tolerance);
  const underBudget = measuredMs < config.targetMs * (1 - config.tolerance);
  const hasDirectTiming = sample.gpuMs !== null;

  if (overBudget) {
    const lowered = Math.min(state.scale, scaleForCost(fullCostMs, config));
    const failedProbe = state.probing;
    return {
      scale: failedProbe ? Math.max(config.minScale, state.scale - config.step) : lowered,
      fullCostMs,
      calmFrames: 0,
      probeAfterFrames: failedProbe
        ? Math.min(state.probeAfterFrames * 2, config.maxProbeAfterFrames)
        : state.probeAfterFrames,
      probing: false,
    };
  }

  if (hasDirectTiming) {
    const wanted = scaleForCost(fullCostMs, config);
    const raised = underBudget && wanted > state.scale ? wanted : state.scale;
    return { ...state, scale: raised, fullCostMs, calmFrames: 0, probing: false };
  }

  const calmFrames = state.calmFrames + 1;
  if (state.scale < config.maxScale && calmFrames >= state.probeAfterFrames) {
    return {
      ...state,
      scale: Math.min(config.maxScale, state.scale + config.step),
      fullCostMs,
      calmFrames: 0,
      probing: true,
    };
  }
  return { ...state, fullCostMs, calmFrames, probing: state.probing && calmFrames < 3 };
}

export interface ResolutionLogEntry {
  frame: number;
  moving: boolean;
  scale: number;
  frameMs: number;
  gpuMs: number | null;
}
