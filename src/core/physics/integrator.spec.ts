import { advanceDormandPrince } from './dormand-prince';
import { createRayState, type RayState } from './geodesic';
import { defaultStepRule, rk4Step, stepSize } from './integrator';
import { vec3 } from './vec3';

function boundRay(): RayState {
  const radius = 10;
  const b = 6;
  const tangential = b / radius;
  const radial = -Math.sqrt(1 + (2 * b * b) / radius ** 3 - tangential ** 2);
  return createRayState(vec3(radius, 0, 0), vec3(radial, tangential, 0));
}

function distanceBetween(left: RayState, right: RayState): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function integrateRk4(initial: RayState, span: number, step: number): RayState {
  const state = { ...initial };
  const count = Math.round(span / step);
  for (let index = 0; index < count; index += 1) {
    rk4Step(state, step, true);
  }
  return state;
}

describe('rk4Step', () => {
  it('moves a straight ray exactly when lensing is off', () => {
    const state = createRayState(vec3(10, 1, -2), vec3(-1, 0.25, 0.5));
    rk4Step(state, 0.7, false);
    expect(state.x).toBeCloseTo(10 - 0.7, 14);
    expect(state.y).toBeCloseTo(1 + 0.25 * 0.7, 14);
    expect(state.z).toBeCloseTo(-2 + 0.5 * 0.7, 14);
    expect(state.vx).toBe(-1);
  });

  it('converges with order four against the Dormand-Prince reference', () => {
    const initial = boundRay();
    const span = 6;
    const reference = advanceDormandPrince(initial, span, true, 1e-14);
    const coarse = distanceBetween(integrateRk4(initial, span, 0.2), reference);
    const medium = distanceBetween(integrateRk4(initial, span, 0.1), reference);
    const fine = distanceBetween(integrateRk4(initial, span, 0.05), reference);
    expect(Math.log2(coarse / medium)).toBeGreaterThan(3.7);
    expect(Math.log2(coarse / medium)).toBeLessThan(4.4);
    expect(Math.log2(medium / fine)).toBeGreaterThan(3.7);
    expect(Math.log2(medium / fine)).toBeLessThan(4.4);
  });
});

describe('stepSize', () => {
  it('scales with the radius and respects the bounds', () => {
    const far = createRayState(vec3(1000, 0, 0), vec3(-1, 0, 0));
    const near = createRayState(vec3(2.5, 0, 0), vec3(-1, 0, 0));
    expect(stepSize(defaultStepRule, far, true)).toBe(defaultStepRule.maxStep);
    expect(stepSize(defaultStepRule, near, true)).toBeCloseTo(defaultStepRule.kappa * 2.5, 12);
    const tiny = createRayState(vec3(1e-3, 0, 0), vec3(-1, 0, 0));
    expect(stepSize(defaultStepRule, tiny, true)).toBe(defaultStepRule.minStep);
  });

  it('shrinks where the ray turns quickly and ignores that for straight rays', () => {
    const grazing = createRayState(vec3(3, 0, 0), vec3(0, 1, 0));
    const radial = createRayState(vec3(3, 0, 0), vec3(-1, 0, 0));
    expect(stepSize(defaultStepRule, grazing, true)).toBeLessThan(
      stepSize(defaultStepRule, radial, true),
    );
    expect(stepSize(defaultStepRule, grazing, false)).toBeCloseTo(defaultStepRule.kappa * 3, 12);
  });
});
