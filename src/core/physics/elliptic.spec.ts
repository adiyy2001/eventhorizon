import { deflectionByBinet, deflectionByQuadrature, deflectionSeries } from './deflection';
import {
  carlsonRf,
  completeEllipticK,
  deflectionByElliptic,
  incompleteEllipticF,
} from './elliptic';

const impactParameters = [5.2, 5.3, 5.6, 6, 8, 12, 30, 100, 250, 500];

describe('Carlson RF', () => {
  it('is one for three equal arguments', () => {
    expect(carlsonRf(1, 1, 1)).toBeCloseTo(1, 14);
    expect(carlsonRf(4, 4, 4)).toBeCloseTo(0.5, 14);
  });

  it('is symmetric in its arguments', () => {
    expect(carlsonRf(1, 2, 3)).toBeCloseTo(carlsonRf(3, 1, 2), 14);
    expect(carlsonRf(1, 2, 3)).toBeCloseTo(0.7269459354689082, 12);
  });
});

describe('elliptic integrals', () => {
  it('gives the quarter period at zero parameter and the tabulated value at one half', () => {
    expect(completeEllipticK(0)).toBeCloseTo(Math.PI / 2, 14);
    expect(completeEllipticK(0.5)).toBeCloseTo(1.8540746773013719, 13);
  });

  it('reduces the incomplete integral to the amplitude at zero parameter', () => {
    for (const amplitude of [0.1, 0.7, 1.3]) {
      expect(incompleteEllipticF(amplitude, 0)).toBeCloseTo(amplitude, 14);
    }
  });

  it('reaches the complete integral at a right angle amplitude', () => {
    for (const parameter of [0.1, 0.5, 0.9]) {
      expect(incompleteEllipticF(Math.PI / 2, parameter)).toBeCloseTo(
        completeEllipticK(parameter),
        13,
      );
    }
  });
});

describe('deflection by elliptic integrals', () => {
  it('reproduces the reference value at b = 100', () => {
    expect(deflectionByElliptic(100)).toBeCloseTo(0.04122253974927226, 11);
  });

  it('agrees with the quadrature of the exact integral to 1e-10 from b = 5.2 to 500', () => {
    for (const b of impactParameters) {
      expect(Math.abs(deflectionByElliptic(b) - deflectionByQuadrature(b)), String(b)).toBeLessThan(
        1e-10,
      );
    }
  });

  it('agrees with the Binet integration to 1e-8', () => {
    for (const b of impactParameters) {
      expect(Math.abs(deflectionByElliptic(b) - deflectionByBinet(b)), String(b)).toBeLessThan(
        1e-8,
      );
    }
  });

  it('follows the three term series far from the hole', () => {
    expect(Math.abs(deflectionByElliptic(500) - deflectionSeries(500))).toBeLessThan(1e-8);
  });

  it('turns the ray by more than a half turn just outside the critical impact parameter', () => {
    expect(deflectionByElliptic(5.2)).toBeGreaterThan(Math.PI);
  });

  it('rejects rays that fall into the hole', () => {
    expect(() => deflectionByElliptic(5)).toThrow(RangeError);
  });
});
