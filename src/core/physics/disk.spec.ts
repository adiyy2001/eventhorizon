import { HOTTEST_RADIUS_FACTOR, ISCO_RADIUS } from './constants';
import {
  combineRedshift,
  diskTemperature,
  isInsideAnnulus,
  keplerianAngularVelocity,
  localOrbitalSpeed,
  observedIntensityScale,
  observedTemperature,
  redshiftParts,
} from './disk';

describe('disk temperature', () => {
  it('vanishes at the inner edge and inside it', () => {
    expect(diskTemperature(ISCO_RADIUS, ISCO_RADIUS, 9000)).toBe(0);
    expect(diskTemperature(4, ISCO_RADIUS, 9000)).toBe(0);
  });

  it('peaks at 49/36 of the inner radius with the requested peak temperature', () => {
    const peakRadius = HOTTEST_RADIUS_FACTOR * ISCO_RADIUS;
    expect(peakRadius).toBeCloseTo(8.1666666667, 9);
    expect(diskTemperature(peakRadius, ISCO_RADIUS, 9000)).toBeCloseTo(9000, 9);
    expect(diskTemperature(peakRadius - 0.5, ISCO_RADIUS, 9000)).toBeLessThan(9000);
    expect(diskTemperature(peakRadius + 0.5, ISCO_RADIUS, 9000)).toBeLessThan(9000);
  });

  it('falls off as r^(-3/4) far from the inner edge', () => {
    const near = diskTemperature(100, ISCO_RADIUS, 9000);
    const far = diskTemperature(200, ISCO_RADIUS, 9000);
    expect(near / far).toBeCloseTo(Math.pow(2, 0.75), 1);
  });

  it('scales linearly with the peak temperature', () => {
    expect(diskTemperature(12, ISCO_RADIUS, 18000)).toBeCloseTo(
      2 * diskTemperature(12, ISCO_RADIUS, 9000),
      9,
    );
  });
});

describe('orbits', () => {
  it('uses the Keplerian angular velocity and a local speed of one half at the ISCO', () => {
    expect(keplerianAngularVelocity(ISCO_RADIUS)).toBeCloseTo(Math.pow(6, -1.5), 15);
    expect(localOrbitalSpeed(ISCO_RADIUS)).toBeCloseTo(0.5, 15);
    expect(localOrbitalSpeed(3)).toBeCloseTo(1, 15);
  });

  it('tests membership of the annulus inclusively', () => {
    const disk = { innerRadius: 6, outerRadius: 20 };
    expect(isInsideAnnulus(6, disk)).toBe(true);
    expect(isInsideAnnulus(20, disk)).toBe(true);
    expect(isInsideAnnulus(5.99, disk)).toBe(false);
    expect(isInsideAnnulus(20.01, disk)).toBe(false);
  });
});

describe('redshift', () => {
  const farObserver = 1e12;

  it('gives sqrt(1/2) at the ISCO for a photon without angular momentum', () => {
    expect(redshiftParts(6, 0, farObserver).total).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it('matches hand-computed values at r = 8 and r = 12', () => {
    expect(redshiftParts(8, 3, farObserver).total).toBeCloseTo(0.9114059084722614, 9);
    expect(redshiftParts(8, -3, farObserver).total).toBeCloseTo(0.6980236760269536, 9);
    expect(redshiftParts(12, 3, farObserver).total).toBeCloseTo(0.9333867933330483, 9);
    expect(redshiftParts(12, -3, farObserver).total).toBeCloseTo(0.8077323430712681, 9);
    expect(redshiftParts(6, 2, farObserver).total).toBeCloseTo(0.8184890303166076, 9);
  });

  it('equals the combined brief formula for any observer at infinity', () => {
    for (const radius of [6, 7.5, 10, 25]) {
      for (const lambda of [-4, -1, 0, 1.5, 4]) {
        const parts = redshiftParts(radius, lambda, farObserver);
        const brief = Math.sqrt(1 - 3 / radius) / (1 - keplerianAngularVelocity(radius) * lambda);
        expect(parts.total).toBeCloseTo(brief, 9);
      }
    }
  });

  it('multiplies its parts to the total to 1e-12', () => {
    const parts = redshiftParts(9, 2.5, 20);
    expect(
      Math.abs(parts.gravitational * parts.observer * parts.kinematic - parts.total),
    ).toBeLessThan(1e-12);
  });

  it('applies the observer factor of a static observer at D = 20', () => {
    const parts = redshiftParts(10, 0, 20);
    expect(parts.observer).toBeCloseTo(1 / Math.sqrt(0.9), 14);
    expect(parts.observer).toBeCloseTo(1.0540925533894598, 14);
  });

  it('raises g above its lambda = 0 value for a positive photon angular momentum', () => {
    const base = redshiftParts(8, 0, 30).total;
    expect(redshiftParts(8, 2, 30).total).toBeGreaterThan(base);
    expect(redshiftParts(8, -2, 30).total).toBeLessThan(base);
  });

  it('switches the gravitational and Doppler parts independently', () => {
    const parts = redshiftParts(8, 2, 30);
    expect(combineRedshift(parts, { gravitational: true, doppler: true })).toBeCloseTo(
      parts.total,
      14,
    );
    expect(combineRedshift(parts, { gravitational: false, doppler: true })).toBeCloseTo(
      parts.kinematic,
      14,
    );
    expect(combineRedshift(parts, { gravitational: true, doppler: false })).toBeCloseTo(
      parts.gravitational * parts.observer,
      14,
    );
    expect(combineRedshift(parts, { gravitational: false, doppler: false })).toBe(1);
  });

  it('scales temperature by g and intensity by g^4', () => {
    expect(observedTemperature(8000, 0.5)).toBe(4000);
    expect(observedIntensityScale(0.5)).toBeCloseTo(0.0625, 15);
  });
});
