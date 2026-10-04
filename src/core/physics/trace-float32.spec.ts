import { CRITICAL_IMPACT_PARAMETER, ISCO_RADIUS } from './constants';
import {
  angleForImpactParameter,
  cameraBasis,
  directionAtAngle,
  staticObserverRay,
} from './observer';
import { defaultTraceOptions, traceRay } from './trace';
import { staticObserverState32, traceRayFloat32 } from './trace-float32';
import { angleBetween, vec3 } from './vec3';

const distance = 30;
const basis = cameraBasis({
  distance,
  inclination: (80 * Math.PI) / 180,
  azimuth: 0.3,
  verticalFieldOfView: 1,
});
const disk = { innerRadius: ISCO_RADIUS, outerRadius: 20 };

function localDirection(impactParameter: number, roll: number) {
  const angle = angleForImpactParameter(distance, impactParameter);
  const sideways = vec3(
    basis.up.x * Math.cos(roll) + basis.right.x * Math.sin(roll),
    basis.up.y * Math.cos(roll) + basis.right.y * Math.sin(roll),
    basis.up.z * Math.cos(roll) + basis.right.z * Math.sin(roll),
  );
  return vec3(
    basis.forward.x * Math.cos(angle) + sideways.x * Math.sin(angle),
    basis.forward.y * Math.cos(angle) + sideways.y * Math.sin(angle),
    basis.forward.z * Math.cos(angle) + sideways.z * Math.sin(angle),
  );
}

describe('staticObserverState32', () => {
  it('agrees with the float64 observer setup to single precision', () => {
    const direction = localDirection(8, 1);
    const reference = staticObserverRay(basis.position, direction);
    const state = staticObserverState32(basis.position, direction);
    expect(state.x).toBeCloseTo(reference.x, 5);
    expect(state.vx).toBeCloseTo(reference.vx, 6);
    expect(state.vy).toBeCloseTo(reference.vy, 6);
    expect(state.vz).toBeCloseTo(reference.vz, 6);
  });

  it('handles a ray aimed exactly at the hole', () => {
    const state = staticObserverState32(basis.position, directionAtAngle(basis, 0));
    expect(Math.hypot(state.vx, state.vy, state.vz)).toBeCloseTo(1, 5);
  });
});

describe('traceRayFloat32', () => {
  const options = defaultTraceOptions(distance, disk);

  it('captures a ray aimed at the hole', () => {
    const result = traceRayFloat32(
      staticObserverState32(basis.position, directionAtAngle(basis, 0)),
      options,
    );
    expect(result.outcome).toBe('captured');
    expect(result.stepLimitReached).toBe(false);
  });

  it.each([
    [4.5, 0.2],
    [5.6, 2.1],
    [7, 4],
    [12, 1],
    [30, 5],
  ])('matches the float64 tracer for impact parameter %f', (impact, roll) => {
    const direction = localDirection(impact, roll);
    const reference = traceRay(staticObserverRay(basis.position, direction), options);
    const result = traceRayFloat32(staticObserverState32(basis.position, direction), options);
    expect(result.outcome).toBe(reference.outcome);
    if (reference.outcome === 'escaped') {
      expect(angleBetween(result.direction, reference.finalDirection)).toBeLessThan(1e-3);
    }
    if (reference.diskHit !== null && result.diskHit !== null) {
      expect(result.diskHit.radius).toBeCloseTo(reference.diskHit.radius, 2);
      expect(result.diskHit.lambda).toBeCloseTo(reference.diskHit.lambda, 3);
      expect(result.diskHit.index).toBe(reference.diskHit.index);
    }
  });

  it('keeps counting plane crossings that miss the annulus', () => {
    const narrow = defaultTraceOptions(distance, { innerRadius: 8, outerRadius: 8.5 });
    const result = traceRayFloat32(
      staticObserverState32(basis.position, localDirection(6.2, 0.4)),
      narrow,
    );
    expect(result.crossings).toBeGreaterThanOrEqual(1);
  });

  it('flags the step limit and counts the ray as captured', () => {
    const result = traceRayFloat32(
      staticObserverState32(basis.position, localDirection(CRITICAL_IMPACT_PARAMETER + 1e-4, 0)),
      { ...options, maxSteps: 40 },
    );
    expect(result.stepLimitReached).toBe(true);
    expect(result.outcome).toBe('captured');
  });

  it('flies straight when lensing is off and still catches rays inside the horizon', () => {
    const straight = { ...options, lensing: false };
    expect(
      traceRayFloat32(staticObserverState32(basis.position, directionAtAngle(basis, 0)), straight)
        .outcome,
    ).toBe('captured');
    const passing = traceRayFloat32(staticObserverState32(basis.position, localDirection(9, 2)), {
      ...straight,
      disk: null,
    });
    expect(passing.outcome).toBe('escaped');
    const reference = traceRay(staticObserverRay(basis.position, localDirection(9, 2)), {
      ...straight,
      disk: null,
    });
    expect(angleBetween(passing.direction, reference.finalDirection)).toBeLessThan(1e-5);
  });

  it('limits a single crossing when higher order images are off', () => {
    const firstOnly = { ...options, higherOrderImages: false };
    const direction = localDirection(6.1, 0.1);
    expect(
      traceRayFloat32(staticObserverState32(basis.position, direction), firstOnly).crossings,
    ).toBeLessThanOrEqual(1);
  });
});
