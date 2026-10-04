const R2_FIRST = 0.7548776662466927;
const R2_SECOND = 0.5698402909980532;

export interface Jitter {
  x: number;
  y: number;
}

function fractionalPart(value: number): number {
  return value - Math.floor(value);
}

export function jitterForFrame(frameIndex: number): Jitter {
  return {
    x: fractionalPart(0.5 + frameIndex * R2_FIRST) - 0.5,
    y: fractionalPart(0.5 + frameIndex * R2_SECOND) - 0.5,
  };
}

export function historyWeight(framesAccumulated: number): number {
  return 1 / (framesAccumulated + 1);
}

export interface AccumulationState {
  key: number | null;
  frames: number;
}

export interface AccumulationStep {
  state: AccumulationState;
  frameIndex: number;
  reset: boolean;
}

export const initialAccumulation: AccumulationState = { key: null, frames: 0 };

export const convergedFrameCount = 256;

export function accumulationKey(sceneHash: number, width: number, height: number): number {
  let mixed = sceneHash >>> 0;
  for (const word of [width, height]) {
    mixed = Math.imul(mixed ^ word, 0x01000193) >>> 0;
    mixed = (mixed ^ (mixed >>> 15)) >>> 0;
  }
  return mixed;
}

export function stepAccumulation(state: AccumulationState, key: number): AccumulationStep {
  const reset = state.key !== key;
  const frameIndex = reset ? 0 : state.frames;
  return { state: { key, frames: frameIndex + 1 }, frameIndex, reset };
}

export function isConverged(state: AccumulationState): boolean {
  return state.frames >= convergedFrameCount;
}
