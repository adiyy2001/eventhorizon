import { PHOTON_SPHERE_RADIUS, SCHWARZSCHILD_RADIUS } from './constants';
import { type TraceOptions } from './trace';
import { type Vec3 } from './vec3';

const f = Math.fround;

function mul(left: number, right: number): number {
  return f(left * right);
}

function add(left: number, right: number): number {
  return f(left + right);
}

function sub(left: number, right: number): number {
  return f(left - right);
}

function div(left: number, right: number): number {
  return f(left / right);
}

function root(value: number): number {
  return f(Math.sqrt(value));
}

function dot3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return add(add(mul(ax, bx), mul(ay, by)), mul(az, bz));
}

function length3(x: number, y: number, z: number): number {
  return root(dot3(x, y, z, x, y, z));
}

export interface Float32State {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface Float32Crossing {
  index: number;
  radius: number;
  lambda: number;
  x: number;
  z: number;
  hitsDisk: boolean;
}

export interface Float32TraceResult {
  outcome: 'captured' | 'escaped' | 'disk';
  direction: Vec3;
  steps: number;
  crossings: number;
  stepLimitReached: boolean;
  diskHit: Float32Crossing | null;
}

function accelerationFactor32(state: Float32State): number {
  const { x, y, z, vx, vy, vz } = state;
  const cx = sub(mul(y, vz), mul(z, vy));
  const cy = sub(mul(z, vx), mul(x, vz));
  const cz = sub(mul(x, vy), mul(y, vx));
  const hSquared = dot3(cx, cy, cz, cx, cy, cz);
  const radiusSquared = dot3(x, y, z, x, y, z);
  const radius = root(radiusSquared);
  return div(mul(-3, hSquared), mul(mul(radiusSquared, radiusSquared), radius));
}

function stepSize32(options: TraceOptions, state: Float32State, lensing: boolean): number {
  const radiusSquared = dot3(state.x, state.y, state.z, state.x, state.y, state.z);
  const radius = root(radiusSquared);
  let size = mul(f(options.step.kappa), radius);
  if (lensing) {
    const cx = sub(mul(state.y, state.vz), mul(state.z, state.vy));
    const cy = sub(mul(state.z, state.vx), mul(state.x, state.vz));
    const cz = sub(mul(state.x, state.vy), mul(state.y, state.vx));
    const hSquared = dot3(cx, cy, cz, cx, cy, cz);
    const bending = div(mul(f(options.step.angularWeight), hSquared), radiusSquared);
    size = div(size, add(1, bending));
  }
  return Math.min(f(options.step.maxStep), Math.max(f(options.step.minStep), size));
}

function rk4Step32(state: Float32State, dt: number, lensing: boolean): void {
  const half = mul(0.5, dt);
  const accelerate = (probe: Float32State): [number, number, number] => {
    const factor = lensing ? accelerationFactor32(probe) : 0;
    return [mul(factor, probe.x), mul(factor, probe.y), mul(factor, probe.z)];
  };
  const advance = (
    step: number,
    velocity: Float32State,
    accel: readonly number[],
  ): Float32State => ({
    x: add(state.x, mul(step, velocity.vx)),
    y: add(state.y, mul(step, velocity.vy)),
    z: add(state.z, mul(step, velocity.vz)),
    vx: add(state.vx, mul(step, accel[0] ?? 0)),
    vy: add(state.vy, mul(step, accel[1] ?? 0)),
    vz: add(state.vz, mul(step, accel[2] ?? 0)),
  });

  const a1 = accelerate(state);
  const stage2 = advance(half, state, a1);
  const a2 = accelerate(stage2);
  const stage3 = advance(half, stage2, a2);
  const a3 = accelerate(stage3);
  const stage4 = advance(dt, stage3, a3);
  const a4 = accelerate(stage4);

  const sixth = div(dt, 6);
  const combine = (start: number, k1: number, k2: number, k3: number, k4: number): number =>
    add(start, mul(sixth, add(add(add(k1, mul(2, k2)), mul(2, k3)), k4)));

  const next: Float32State = {
    x: combine(state.x, state.vx, stage2.vx, stage3.vx, stage4.vx),
    y: combine(state.y, state.vy, stage2.vy, stage3.vy, stage4.vy),
    z: combine(state.z, state.vz, stage2.vz, stage3.vz, stage4.vz),
    vx: combine(state.vx, a1[0], a2[0], a3[0], a4[0]),
    vy: combine(state.vy, a1[1], a2[1], a3[1], a4[1]),
    vz: combine(state.vz, a1[2], a2[2], a3[2], a4[2]),
  };
  Object.assign(state, next);
}

function hermite32(
  start: number,
  startSlope: number,
  end: number,
  endSlope: number,
  span: number,
  fraction: number,
): number {
  const squared = mul(fraction, fraction);
  const cubed = mul(squared, fraction);
  const h00 = add(sub(mul(2, cubed), mul(3, squared)), 1);
  const h10 = add(sub(cubed, mul(2, squared)), fraction);
  const h01 = add(mul(-2, cubed), mul(3, squared));
  const h11 = sub(cubed, squared);
  return add(
    add(mul(h00, start), mul(mul(h10, span), startSlope)),
    add(mul(h01, end), mul(mul(h11, span), endSlope)),
  );
}

function hermiteSlope32(
  start: number,
  startSlope: number,
  end: number,
  endSlope: number,
  span: number,
  fraction: number,
): number {
  const squared = mul(fraction, fraction);
  const d00 = sub(mul(6, squared), mul(6, fraction));
  const d10 = add(sub(mul(3, squared), mul(4, fraction)), 1);
  const d01 = add(mul(-6, squared), mul(6, fraction));
  const d11 = sub(mul(3, squared), mul(2, fraction));
  return add(
    add(mul(d00, start), mul(mul(d10, span), startSlope)),
    add(mul(d01, end), mul(mul(d11, span), endSlope)),
  );
}

export const planeCrossingIterations = 24;

function locatePlaneCrossing32(
  previous: Float32State,
  current: Float32State,
  span: number,
): number {
  let low = 0;
  let high = 1;
  const startSign = Math.sign(previous.y);
  let fraction = div(previous.y, sub(previous.y, current.y));
  for (let iteration = 0; iteration < planeCrossingIterations; iteration += 1) {
    const value = hermite32(previous.y, previous.vy, current.y, current.vy, span, fraction);
    if (value === 0) {
      return fraction;
    }
    if (Math.sign(value) === startSign) {
      low = fraction;
    } else {
      high = fraction;
    }
    const slope = hermiteSlope32(previous.y, previous.vy, current.y, current.vy, span, fraction);
    let next = sub(fraction, div(value, slope));
    if (!(next > low && next < high)) {
      next = mul(0.5, add(low, high));
    }
    if (Math.abs(sub(next, fraction)) < 1e-6) {
      return next;
    }
    fraction = next;
  }
  return fraction;
}

function segmentEntersSphere32(
  previous: Float32State,
  current: Float32State,
  radius: number,
): boolean {
  const dx = sub(current.x, previous.x);
  const dy = sub(current.y, previous.y);
  const dz = sub(current.z, previous.z);
  const lengthSquared = dot3(dx, dy, dz, dx, dy, dz);
  const along = div(-dot3(previous.x, previous.y, previous.z, dx, dy, dz), lengthSquared);
  const fraction = Math.min(1, Math.max(0, along));
  const px = add(previous.x, mul(fraction, dx));
  const py = add(previous.y, mul(fraction, dy));
  const pz = add(previous.z, mul(fraction, dz));
  return dot3(px, py, pz, px, py, pz) < mul(radius, radius);
}

export function staticObserverState32(position: Vec3, localDirection: Vec3): Float32State {
  const px = f(position.x);
  const py = f(position.y);
  const pz = f(position.z);
  const distance = length3(px, py, pz);
  const directionLength = length3(f(localDirection.x), f(localDirection.y), f(localDirection.z));
  const dx = div(f(localDirection.x), directionLength);
  const dy = div(f(localDirection.y), directionLength);
  const dz = div(f(localDirection.z), directionLength);
  const ix = div(-px, distance);
  const iy = div(-py, distance);
  const iz = div(-pz, distance);
  const cosAngle = dot3(dx, dy, dz, ix, iy, iz);
  const tx = sub(dx, mul(ix, cosAngle));
  const ty = sub(dy, mul(iy, cosAngle));
  const tz = sub(dz, mul(iz, cosAngle));
  const sinAngle = length3(tx, ty, tz);
  const horizonFactor = root(sub(1, div(SCHWARZSCHILD_RADIUS, distance)));
  const tangentialSpeed = div(sinAngle, horizonFactor);
  const tangentialScale = sinAngle > 0 ? div(tangentialSpeed, sinAngle) : 0;
  return {
    x: px,
    y: py,
    z: pz,
    vx: add(mul(tx, tangentialScale), mul(ix, cosAngle)),
    vy: add(mul(ty, tangentialScale), mul(iy, cosAngle)),
    vz: add(mul(tz, tangentialScale), mul(iz, cosAngle)),
  };
}

export function traceRayFloat32(initial: Float32State, options: TraceOptions): Float32TraceResult {
  const state: Float32State = { ...initial };
  const captureRadius = f(SCHWARZSCHILD_RADIUS * (1 + options.captureMargin));
  const escapeRadius = f(options.escapeRadius);
  const crossingLimit = options.higherOrderImages ? options.maxCrossings : 1;
  let steps = 0;
  let planeCrossings = 0;

  const finish = (
    outcome: Float32TraceResult['outcome'],
    stepLimitReached: boolean,
    diskHit: Float32Crossing | null,
  ): Float32TraceResult => {
    const size = length3(state.vx, state.vy, state.vz);
    return {
      outcome,
      direction: { x: div(state.vx, size), y: div(state.vy, size), z: div(state.vz, size) },
      steps,
      crossings: planeCrossings,
      stepLimitReached,
      diskHit,
    };
  };

  for (;;) {
    const radius = length3(state.x, state.y, state.z);
    const radialRate = dot3(state.x, state.y, state.z, state.vx, state.vy, state.vz);
    if (
      options.lensing &&
      (radius < captureRadius || (radius < PHOTON_SPHERE_RADIUS && radialRate < 0))
    ) {
      return finish('captured', false, null);
    }
    if (radius > escapeRadius && radialRate > 0) {
      return finish('escaped', false, null);
    }
    if (steps >= options.maxSteps) {
      return finish('captured', true, null);
    }

    const previous: Float32State = { ...state };
    const span = stepSize32(options, state, options.lensing);
    rk4Step32(state, span, options.lensing);
    steps += 1;

    if (!options.lensing && segmentEntersSphere32(previous, state, captureRadius)) {
      return finish('captured', false, null);
    }

    const crossesPlane = (previous.y < 0 && state.y >= 0) || (previous.y > 0 && state.y <= 0);
    if (options.disk !== null && planeCrossings < crossingLimit && crossesPlane) {
      planeCrossings += 1;
      const fraction = locatePlaneCrossing32(previous, state, span);
      const x = hermite32(previous.x, previous.vx, state.x, state.vx, span, fraction);
      const z = hermite32(previous.z, previous.vz, state.z, state.vz, span, fraction);
      const crossingRadius = root(add(mul(x, x), mul(z, z)));
      const hitsDisk =
        crossingRadius >= f(options.disk.innerRadius) &&
        crossingRadius <= f(options.disk.outerRadius);
      const crossing: Float32Crossing = {
        index: planeCrossings,
        radius: crossingRadius,
        lambda: sub(mul(previous.x, previous.vz), mul(previous.z, previous.vx)),
        x,
        z,
        hitsDisk,
      };
      if (hitsDisk) {
        return finish('disk', false, crossing);
      }
    }
  }
}
