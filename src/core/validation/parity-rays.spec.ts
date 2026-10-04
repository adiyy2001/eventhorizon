import { CRITICAL_IMPACT_PARAMETER } from '../physics/constants';
import { staticObserverRay } from '../physics/observer';
import { traceRay } from '../physics/trace';
import { vec3 } from '../physics/vec3';
import {
  defaultParitySpec,
  generateParityRays,
  isAmbiguousReference,
  parityTraceOptions,
  parityView,
  type ParityRay,
} from './parity-rays';

const smallSpec = { ...defaultParitySpec, count: 400 };

describe('generateParityRays', () => {
  const rays = generateParityRays(smallSpec);

  it('is deterministic for a seed', () => {
    expect(generateParityRays(smallSpec)).toEqual(rays);
    expect(generateParityRays({ ...smallSpec, seed: 7 })).not.toEqual(rays);
  });

  it('returns the requested number of rays', () => {
    expect(rays).toHaveLength(400);
  });

  it('stores float32 values so that both sides start from identical inputs', () => {
    for (const ray of rays) {
      for (const value of [...ray.position, ...ray.direction]) {
        expect(Math.fround(value)).toBe(value);
      }
    }
  });

  it('keeps every impact parameter out of the margin around the critical value', () => {
    for (const ray of rays) {
      expect(Math.abs(ray.impactParameter - CRITICAL_IMPACT_PARAMETER)).toBeGreaterThanOrEqual(
        smallSpec.criticalMargin,
      );
    }
  });

  it('covers every distance and the impact parameter range', () => {
    const distances = new Set(rays.map((ray) => ray.distance));
    expect([...distances].sort((left, right) => left - right)).toEqual([10, 30, 60]);
    const impacts = rays.map((ray) => ray.impactParameter);
    expect(Math.min(...impacts)).toBeLessThan(0.7 * CRITICAL_IMPACT_PARAMETER);
    expect(Math.max(...impacts)).toBeGreaterThan(20);
  });

  it('contains captured, escaped and disk rays, including later crossings', () => {
    const options = parityTraceOptions(smallSpec);
    const results = rays.map((ray) =>
      traceRay(staticObserverRay(vec3(...ray.position), vec3(...ray.direction)), options),
    );
    const outcomes = new Set(results.map((result) => result.outcome));
    expect(outcomes).toEqual(new Set(['captured', 'escaped', 'disk']));
    expect(results.some((result) => result.crossings.length >= 2)).toBe(true);
    expect(results.some((result) => (result.diskHit?.index ?? 0) >= 2)).toBe(true);
    expect(results.every((result) => !result.stepLimitReached)).toBe(true);
  });
});

describe('parityView', () => {
  it('uses the farthest observer so that one escape radius serves the whole set', () => {
    expect(parityView(defaultParitySpec).distance).toBe(60);
    expect(parityTraceOptions(defaultParitySpec).escapeRadius).toBe(120);
  });
});

describe('isAmbiguousReference', () => {
  const ray: ParityRay = {
    position: [30, 0, 0],
    direction: [-1, 0, 0],
    distance: 30,
    impactParameter: 8,
  };

  it('accepts a ray far from every edge', () => {
    expect(isAmbiguousReference(ray, defaultParitySpec, [10, 14], false)).toBe(false);
  });

  it('rejects step limited rays, rays near the critical value and rays crossing near a disk edge', () => {
    expect(isAmbiguousReference(ray, defaultParitySpec, [], true)).toBe(true);
    expect(
      isAmbiguousReference(
        { ...ray, impactParameter: CRITICAL_IMPACT_PARAMETER + 0.01 },
        defaultParitySpec,
        [],
        false,
      ),
    ).toBe(true);
    expect(isAmbiguousReference(ray, defaultParitySpec, [6.001], false)).toBe(true);
    expect(isAmbiguousReference(ray, defaultParitySpec, [19.999], false)).toBe(true);
  });
});
