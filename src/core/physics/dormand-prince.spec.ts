import {
  advanceDormandPrince,
  defaultDormandPrinceOptions,
  dormandPrinceTrace,
} from './dormand-prince';
import { createRayState, impactParameter } from './geodesic';
import { vec3 } from './vec3';

function rayFrom(radius: number, b: number) {
  const tangential = b / radius;
  const radial = -Math.sqrt(1 + (2 * b * b) / radius ** 3 - tangential ** 2);
  return createRayState(vec3(radius, 0, 0), vec3(radial, tangential, 0));
}

describe('Dormand-Prince reference', () => {
  it('keeps the impact parameter constant to 1e-12 over a long advance', () => {
    const start = rayFrom(10, 6);
    const end = advanceDormandPrince(start, 30, true, 1e-14);
    expect(Math.abs(impactParameter(end) - 6)).toBeLessThan(1e-12);
  });

  it('classifies a ray below the critical impact parameter as captured', () => {
    const result = dormandPrinceTrace(rayFrom(30, 5), defaultDormandPrinceOptions());
    expect(result.outcome).toBe('captured');
  });

  it('classifies a ray above the critical impact parameter as escaped', () => {
    const result = dormandPrinceTrace(rayFrom(30, 5.5), {
      ...defaultDormandPrinceOptions(),
      escapeRadius: 500,
    });
    expect(result.outcome).toBe('escaped');
    expect(result.steps).toBeGreaterThan(10);
  });

  it('reports exhaustion when the step budget runs out', () => {
    const result = dormandPrinceTrace(rayFrom(30, 5.5), {
      ...defaultDormandPrinceOptions(),
      maxSteps: 3,
    });
    expect(result.outcome).toBe('exhausted');
  });

  it('counts rejected steps when the first step is too large', () => {
    const result = dormandPrinceTrace(rayFrom(10, 5.5), {
      ...defaultDormandPrinceOptions(),
      initialStep: 50,
      escapeRadius: 200,
    });
    expect(result.rejectedSteps).toBeGreaterThan(0);
  });

  it('advances a straight ray exactly with lensing off', () => {
    const start = createRayState(vec3(10, 0, 0), vec3(-1, 0.5, 0));
    const end = advanceDormandPrince(start, 4, false, 1e-12);
    expect(end.x).toBeCloseTo(6, 12);
    expect(end.y).toBeCloseTo(2, 12);
  });
});
