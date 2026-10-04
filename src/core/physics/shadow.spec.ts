import { CRITICAL_IMPACT_PARAMETER } from './constants';
import { cameraBasis, directionAtAngle, staticObserverRay } from './observer';
import {
  defaultCriticalImpactSearch,
  findCriticalImpactParameter,
  shadowAngularRadius,
} from './shadow';
import { defaultTraceOptions, traceRay } from './trace';

function outcomeAtAngle(distance: number, angle: number) {
  const basis = cameraBasis({
    distance,
    inclination: Math.PI / 2,
    azimuth: 0,
    verticalFieldOfView: 1,
  });
  const ray = staticObserverRay(basis.position, directionAtAngle(basis, angle));
  return traceRay(ray, defaultTraceOptions(distance, null)).outcome;
}

describe('shadowAngularRadius', () => {
  it('matches the reference values at D = 10, 30 and 100', () => {
    expect((shadowAngularRadius(10) * 180) / Math.PI).toBeCloseTo(27.69, 2);
    expect((shadowAngularRadius(30) * 180) / Math.PI).toBeCloseTo(9.633, 3);
    expect((shadowAngularRadius(100) * 180) / Math.PI).toBeCloseTo(2.949, 3);
  });

  it('approaches b_c over D for a distant observer', () => {
    expect(shadowAngularRadius(1e6)).toBeCloseTo(CRITICAL_IMPACT_PARAMETER / 1e6, 10);
  });
});

describe('shadow boundary in the local frame', () => {
  it.each([10, 30, 100])(
    'captures at 0.999 and releases at 1.001 of the angular radius for D = %d',
    (distance) => {
      const radius = shadowAngularRadius(distance);
      expect(outcomeAtAngle(distance, 0.999 * radius)).toBe('captured');
      expect(outcomeAtAngle(distance, 1.001 * radius)).toBe('escaped');
    },
  );
});

describe('findCriticalImpactParameter', () => {
  it.each([10, 30, 100])('finds 3 sqrt(3) within 1e-6 for D = %d', (distance) => {
    const result = findCriticalImpactParameter(defaultCriticalImpactSearch(distance));
    expect(Math.abs(result.impactParameter - CRITICAL_IMPACT_PARAMETER)).toBeLessThan(1e-6);
    expect(result.iterations).toBeGreaterThan(20);
  });

  it('is within 1e-4 even with a step ten times coarser than the production rule', () => {
    const coarse = defaultTraceOptions(30, null);
    const result = findCriticalImpactParameter({
      ...defaultCriticalImpactSearch(30),
      tolerance: 1e-7,
      traceOptions: { ...coarse, step: { ...coarse.step, kappa: 0.1 } },
    });
    expect(Math.abs(result.impactParameter - CRITICAL_IMPACT_PARAMETER)).toBeLessThan(1e-4);
  });
});
