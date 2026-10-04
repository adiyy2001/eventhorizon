import { SCHWARZSCHILD_RADIUS } from './constants';
import { accelerationFactor, createRayState, type RayState } from './geodesic';
import { vec3 } from './vec3';

type Vec6 = readonly [number, number, number, number, number, number];

export interface DormandPrinceOptions {
  lensing: boolean;
  tolerance: number;
  escapeRadius: number;
  captureRadius: number;
  initialStep: number;
  maxSteps: number;
}

export type ReferenceOutcome = 'captured' | 'escaped' | 'exhausted';

export interface DormandPrinceResult {
  outcome: ReferenceOutcome;
  state: RayState;
  steps: number;
  rejectedSteps: number;
}

export function defaultDormandPrinceOptions(): DormandPrinceOptions {
  return {
    lensing: true,
    tolerance: 1e-13,
    escapeRadius: 1000,
    captureRadius: SCHWARZSCHILD_RADIUS * 1.001,
    initialStep: 0.01,
    maxSteps: 1_000_000,
  };
}

function toVec6(state: RayState): Vec6 {
  return [state.x, state.y, state.z, state.vx, state.vy, state.vz];
}

function fromVec6(values: Vec6): RayState {
  return createRayState(
    vec3(values[0], values[1], values[2]),
    vec3(values[3], values[4], values[5]),
  );
}

function derivative(values: Vec6, lensing: boolean): Vec6 {
  const factor = lensing
    ? accelerationFactor(values[0], values[1], values[2], values[3], values[4], values[5])
    : 0;
  return [
    values[3],
    values[4],
    values[5],
    factor * values[0],
    factor * values[1],
    factor * values[2],
  ];
}

function combine(base: Vec6, step: number, terms: readonly (readonly [number, Vec6])[]): Vec6 {
  const out: [number, number, number, number, number, number] = [
    base[0],
    base[1],
    base[2],
    base[3],
    base[4],
    base[5],
  ];
  for (const [weight, slope] of terms) {
    out[0] += step * weight * slope[0];
    out[1] += step * weight * slope[1];
    out[2] += step * weight * slope[2];
    out[3] += step * weight * slope[3];
    out[4] += step * weight * slope[4];
    out[5] += step * weight * slope[5];
  }
  return out;
}

interface AttemptedStep {
  next: Vec6;
  error: number;
}

function attemptStep(y: Vec6, step: number, lensing: boolean, tolerance: number): AttemptedStep {
  const k1 = derivative(y, lensing);
  const k2 = derivative(combine(y, step, [[1 / 5, k1]]), lensing);
  const k3 = derivative(
    combine(y, step, [
      [3 / 40, k1],
      [9 / 40, k2],
    ]),
    lensing,
  );
  const k4 = derivative(
    combine(y, step, [
      [44 / 45, k1],
      [-56 / 15, k2],
      [32 / 9, k3],
    ]),
    lensing,
  );
  const k5 = derivative(
    combine(y, step, [
      [19372 / 6561, k1],
      [-25360 / 2187, k2],
      [64448 / 6561, k3],
      [-212 / 729, k4],
    ]),
    lensing,
  );
  const k6 = derivative(
    combine(y, step, [
      [9017 / 3168, k1],
      [-355 / 33, k2],
      [46732 / 5247, k3],
      [49 / 176, k4],
      [-5103 / 18656, k5],
    ]),
    lensing,
  );
  const next = combine(y, step, [
    [35 / 384, k1],
    [500 / 1113, k3],
    [125 / 192, k4],
    [-2187 / 6784, k5],
    [11 / 84, k6],
  ]);
  const k7 = derivative(next, lensing);
  const errorVector = combine([0, 0, 0, 0, 0, 0], step, [
    [71 / 57600, k1],
    [-71 / 16695, k3],
    [71 / 1920, k4],
    [-17253 / 339200, k5],
    [22 / 525, k6],
    [-1 / 40, k7],
  ]);
  let sum = 0;
  for (let index = 0; index < 6; index += 1) {
    const scaleValue =
      tolerance * (1 + Math.max(Math.abs(y[index] ?? 0), Math.abs(next[index] ?? 0)));
    const ratio = (errorVector[index] ?? 0) / scaleValue;
    sum += ratio * ratio;
  }
  return { next, error: Math.sqrt(sum / 6) };
}

export function dormandPrinceTrace(
  initial: RayState,
  options: DormandPrinceOptions,
): DormandPrinceResult {
  let current = toVec6(initial);
  let step = options.initialStep;
  let steps = 0;
  let rejectedSteps = 0;
  while (steps < options.maxSteps) {
    const radius = Math.hypot(current[0], current[1], current[2]);
    const radialVelocity =
      current[0] * current[3] + current[1] * current[4] + current[2] * current[5];
    if (radius < options.captureRadius && options.lensing) {
      return { outcome: 'captured', state: fromVec6(current), steps, rejectedSteps };
    }
    if (radius > options.escapeRadius && radialVelocity > 0) {
      return { outcome: 'escaped', state: fromVec6(current), steps, rejectedSteps };
    }
    const limited = Math.min(step, 0.5 * radius);
    const attempt = attemptStep(current, limited, options.lensing, options.tolerance);
    if (attempt.error <= 1) {
      current = attempt.next;
      steps += 1;
    } else {
      rejectedSteps += 1;
    }
    const growth = attempt.error === 0 ? 5 : 0.9 * Math.pow(attempt.error, -0.2);
    step = limited * Math.min(5, Math.max(0.2, growth));
  }
  return { outcome: 'exhausted', state: fromVec6(current), steps, rejectedSteps };
}

export function advanceDormandPrince(
  initial: RayState,
  span: number,
  lensing: boolean,
  tolerance: number,
): RayState {
  let current = toVec6(initial);
  let elapsed = 0;
  let step = span / 100;
  while (elapsed < span) {
    const limited = Math.min(step, span - elapsed);
    const attempt = attemptStep(current, limited, lensing, tolerance);
    if (attempt.error <= 1) {
      current = attempt.next;
      elapsed += limited;
    }
    const growth = attempt.error === 0 ? 5 : 0.9 * Math.pow(attempt.error, -0.2);
    step = limited * Math.min(5, Math.max(0.2, growth));
  }
  return fromVec6(current);
}
