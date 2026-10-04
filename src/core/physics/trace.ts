import { PHOTON_SPHERE_RADIUS, SCHWARZSCHILD_RADIUS } from './constants';
import { type DiskGeometry, isInsideAnnulus } from './disk';
import {
  angularMomentumSquared,
  copyRayState,
  nullDrift,
  photonAngularMomentumAboutAxis,
  radiusOf,
  type RayState,
  velocityOf,
} from './geodesic';
import { defaultStepRule, rk4Step, stepSize, type StepRule } from './integrator';
import { normalize, type Vec3 } from './vec3';

export type RayOutcome = 'captured' | 'escaped' | 'disk';

export interface TraceOptions {
  lensing: boolean;
  higherOrderImages: boolean;
  disk: DiskGeometry | null;
  step: StepRule;
  escapeRadius: number;
  captureMargin: number;
  maxSteps: number;
  maxCrossings: number;
  trackDrift: boolean;
}

export interface PlaneCrossing {
  index: number;
  radius: number;
  x: number;
  z: number;
  lambda: number;
  hitsDisk: boolean;
}

export interface TraceResult {
  outcome: RayOutcome;
  finalDirection: Vec3;
  finalState: RayState;
  crossings: PlaneCrossing[];
  diskHit: PlaneCrossing | null;
  steps: number;
  stepLimitReached: boolean;
  maxRelativeAngularMomentumDrift: number;
  maxNullDrift: number;
}

export const defaultEscapeRadius = 100;
export const defaultCaptureMargin = 1e-3;
export const defaultMaxSteps = 20_000;
export const defaultMaxCrossings = 16;

export function defaultTraceOptions(
  observerDistance: number,
  disk: DiskGeometry | null,
): TraceOptions {
  return {
    lensing: true,
    higherOrderImages: true,
    disk,
    step: defaultStepRule,
    escapeRadius: Math.max(defaultEscapeRadius, 2 * observerDistance),
    captureMargin: defaultCaptureMargin,
    maxSteps: defaultMaxSteps,
    maxCrossings: defaultMaxCrossings,
    trackDrift: false,
  };
}

function hermite(
  start: number,
  startSlope: number,
  end: number,
  endSlope: number,
  span: number,
  fraction: number,
): number {
  const squared = fraction * fraction;
  const cubed = squared * fraction;
  return (
    (2 * cubed - 3 * squared + 1) * start +
    (cubed - 2 * squared + fraction) * span * startSlope +
    (-2 * cubed + 3 * squared) * end +
    (cubed - squared) * span * endSlope
  );
}

function hermiteSlope(
  start: number,
  startSlope: number,
  end: number,
  endSlope: number,
  span: number,
  fraction: number,
): number {
  const squared = fraction * fraction;
  return (
    (6 * squared - 6 * fraction) * start +
    (3 * squared - 4 * fraction + 1) * span * startSlope +
    (-6 * squared + 6 * fraction) * end +
    (3 * squared - 2 * fraction) * span * endSlope
  );
}

export function locatePlaneCrossing(previous: RayState, current: RayState, span: number): number {
  let low = 0;
  let high = 1;
  const startSign = Math.sign(previous.y);
  let fraction = previous.y / (previous.y - current.y);
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const value = hermite(previous.y, previous.vy, current.y, current.vy, span, fraction);
    if (value === 0) {
      return fraction;
    }
    if (Math.sign(value) === startSign) {
      low = fraction;
    } else {
      high = fraction;
    }
    const slope = hermiteSlope(previous.y, previous.vy, current.y, current.vy, span, fraction);
    let next = fraction - value / slope;
    if (!(next > low && next < high)) {
      next = 0.5 * (low + high);
    }
    if (Math.abs(next - fraction) < 1e-15) {
      return next;
    }
    fraction = next;
  }
  return fraction;
}

function crossingAt(
  previous: RayState,
  current: RayState,
  span: number,
  index: number,
  disk: DiskGeometry,
): PlaneCrossing {
  const fraction = locatePlaneCrossing(previous, current, span);
  const x = hermite(previous.x, previous.vx, current.x, current.vx, span, fraction);
  const z = hermite(previous.z, previous.vz, current.z, current.vz, span, fraction);
  const radius = Math.hypot(x, z);
  return {
    index,
    radius,
    x,
    z,
    lambda: photonAngularMomentumAboutAxis(previous),
    hitsDisk: isInsideAnnulus(radius, disk),
  };
}

function crossesPlane(previousY: number, currentY: number): boolean {
  return (previousY < 0 && currentY >= 0) || (previousY > 0 && currentY <= 0);
}

function segmentEntersSphere(previous: RayState, current: RayState, radius: number): boolean {
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  const dz = current.z - previous.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const along = -(previous.x * dx + previous.y * dy + previous.z * dz) / lengthSquared;
  const fraction = Math.min(1, Math.max(0, along));
  const px = previous.x + fraction * dx;
  const py = previous.y + fraction * dy;
  const pz = previous.z + fraction * dz;
  return px * px + py * py + pz * pz < radius * radius;
}

export function traceRay(initial: RayState, options: TraceOptions): TraceResult {
  const state = copyRayState(initial);
  const captureRadius = SCHWARZSCHILD_RADIUS * (1 + options.captureMargin);
  const crossingLimit = options.higherOrderImages ? options.maxCrossings : 1;
  const crossings: PlaneCrossing[] = [];
  const startHSquared = angularMomentumSquared(
    state.x,
    state.y,
    state.z,
    state.vx,
    state.vy,
    state.vz,
  );
  const startH = Math.sqrt(startHSquared);
  let steps = 0;
  let maxRelativeDrift = 0;
  let maxNull = 0;
  let planeCrossings = 0;

  const finish = (
    outcome: RayOutcome,
    stepLimitReached: boolean,
    diskHit: PlaneCrossing | null,
  ): TraceResult => ({
    outcome,
    finalDirection: normalize(velocityOf(state)),
    finalState: state,
    crossings,
    diskHit,
    steps,
    stepLimitReached,
    maxRelativeAngularMomentumDrift: maxRelativeDrift,
    maxNullDrift: maxNull,
  });

  for (;;) {
    const radius = radiusOf(state);
    const radialRate = state.x * state.vx + state.y * state.vy + state.z * state.vz;
    if (
      options.lensing &&
      (radius < captureRadius || (radius < PHOTON_SPHERE_RADIUS && radialRate < 0))
    ) {
      return finish('captured', false, null);
    }
    if (radius > options.escapeRadius && radialRate > 0) {
      return finish('escaped', false, null);
    }
    if (steps >= options.maxSteps) {
      return finish('captured', true, null);
    }

    const previous = copyRayState(state);
    const span = stepSize(options.step, state, options.lensing);
    rk4Step(state, span, options.lensing);
    steps += 1;

    if (options.trackDrift) {
      const hNow = Math.sqrt(
        angularMomentumSquared(state.x, state.y, state.z, state.vx, state.vy, state.vz),
      );
      maxRelativeDrift = Math.max(maxRelativeDrift, Math.abs(hNow - startH) / startH);
      if (options.lensing) {
        maxNull = Math.max(maxNull, Math.abs(nullDrift(state)));
      }
    }

    if (!options.lensing && segmentEntersSphere(previous, state, captureRadius)) {
      return finish('captured', false, null);
    }

    if (
      options.disk !== null &&
      planeCrossings < crossingLimit &&
      crossesPlane(previous.y, state.y)
    ) {
      planeCrossings += 1;
      const crossing = crossingAt(previous, state, span, planeCrossings, options.disk);
      crossings.push(crossing);
      if (crossing.hitsDisk) {
        return finish('disk', false, crossing);
      }
    }
  }
}
