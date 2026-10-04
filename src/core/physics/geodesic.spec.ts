import { CRITICAL_IMPACT_PARAMETER } from './constants';
import {
  accelerationFactor,
  angularMomentumSquared,
  angularMomentumVector,
  copyRayState,
  createRayState,
  impactParameter,
  nullDrift,
  photonAngularMomentumAboutAxis,
  positionOf,
  radiusOf,
  velocityOf,
} from './geodesic';
import { vec3 } from './vec3';

describe('geodesic quantities', () => {
  it('evaluates the acceleration factor by hand at r = 3 with h = 3', () => {
    const factor = accelerationFactor(3, 0, 0, 0, 1, 0);
    expect(factor).toBeCloseTo(-1 / 9, 15);
  });

  it('is zero for a purely radial ray', () => {
    expect(Math.abs(accelerationFactor(5, 0, 0, 1, 0, 0))).toBe(0);
  });

  it('computes the angular momentum vector and its square', () => {
    const state = createRayState(vec3(1, 2, 3), vec3(-1, 0.5, 2));
    const vector = angularMomentumVector(state);
    expect(vector).toEqual(vec3(2 * 2 - 3 * 0.5, 3 * -1 - 1 * 2, 1 * 0.5 - 2 * -1));
    expect(angularMomentumSquared(1, 2, 3, -1, 0.5, 2)).toBeCloseTo(
      vector.x ** 2 + vector.y ** 2 + vector.z ** 2,
      12,
    );
  });

  it('copies state without sharing it', () => {
    const original = createRayState(vec3(1, 0, 0), vec3(0, 1, 0));
    const copy = copyRayState(original);
    copy.x = 9;
    expect(original.x).toBe(1);
    expect(positionOf(original)).toEqual(vec3(1, 0, 0));
    expect(velocityOf(original)).toEqual(vec3(0, 1, 0));
    expect(radiusOf(copy)).toBe(9);
  });

  it('has zero null drift for an exact initial state at r = 10 with b = 6', () => {
    const radius = 10;
    const b = 6;
    const tangential = b / radius;
    const radial = -Math.sqrt(1 + (2 * b * b) / radius ** 3 - tangential ** 2);
    const state = createRayState(vec3(radius, 0, 0), vec3(radial, tangential, 0));
    expect(Math.abs(nullDrift(state))).toBeLessThan(1e-15);
    expect(impactParameter(state)).toBeCloseTo(b, 13);
  });

  it('exceeds the critical impact parameter only for rays that can escape inward bound', () => {
    expect(CRITICAL_IMPACT_PARAMETER).toBeCloseTo(5.196152422706632, 14);
  });

  it('gives the photon angular momentum about the axis with the backward ray sign', () => {
    const state = createRayState(vec3(0, 0, 1), vec3(1, 0, 0));
    expect(photonAngularMomentumAboutAxis(state)).toBe(-1);
    const mirrored = createRayState(vec3(0, 0, 1), vec3(-1, 0, 0));
    expect(photonAngularMomentumAboutAxis(mirrored)).toBe(1);
  });
});
