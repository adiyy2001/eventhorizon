import {
  asymptoticTailDeflection,
  defaultVectorFormOptions,
  deflectionByBinet,
  deflectionByQuadrature,
  deflectionByVectorForm,
  deflectionSeries,
  turningPointInverseRadius,
  weakFieldDeflection,
} from './deflection';

const impactParameters = [5.3, 5.6, 6, 8, 12, 30, 100, 250, 500];

describe('deflection angle', () => {
  it('agrees between the Binet form and the vector form to 1e-9 for b from 5.3 to 500', () => {
    for (const b of impactParameters) {
      const binet = deflectionByBinet(b);
      const vector = deflectionByVectorForm(b, defaultVectorFormOptions('dormand-prince'));
      expect(Math.abs(binet - vector)).toBeLessThan(1e-9);
    }
  });

  it('agrees between the Binet form and a direct quadrature of the exact integral to 1e-8', () => {
    for (const b of impactParameters) {
      expect(Math.abs(deflectionByBinet(b) - deflectionByQuadrature(b))).toBeLessThan(1e-8);
    }
  });

  it('reproduces the reference value at b = 100', () => {
    expect(deflectionByQuadrature(100)).toBeCloseTo(0.04122253974927226, 12);
  });

  it('tracks the production RK4 tracer within 2e-6 radians', () => {
    for (const b of impactParameters) {
      const production = deflectionByVectorForm(b, defaultVectorFormOptions('rk4'));
      expect(Math.abs(production - deflectionByBinet(b))).toBeLessThan(2e-6);
    }
  });

  it('exceeds a half turn for rays close to the critical impact parameter', () => {
    expect(deflectionByQuadrature(5.3)).toBeGreaterThan(Math.PI);
    expect(deflectionByBinet(5.3)).toBeGreaterThan(Math.PI);
  });

  it('rejects rays that are captured', () => {
    expect(() => deflectionByBinet(5)).toThrow(RangeError);
    expect(() => deflectionByQuadrature(5.19)).toThrow(RangeError);
    expect(() => deflectionByVectorForm(4, defaultVectorFormOptions('rk4'))).toThrow(RangeError);
  });

  it('finds the turning point as the root of the radial potential', () => {
    const b = 10;
    const root = turningPointInverseRadius(b);
    expect(Math.abs(1 / b ** 2 - root ** 2 + 2 * root ** 3)).toBeLessThan(1e-15);
    expect(root).toBeGreaterThan(0);
    expect(root).toBeLessThan(1 / 3);
  });
});

describe('weak field limit', () => {
  it('follows the third order series with an error that falls as b grows', () => {
    const errors = [50, 100, 200, 400].map((b) =>
      Math.abs(deflectionSeries(b) - deflectionByQuadrature(b)),
    );
    expect(errors[1]).toBeLessThan(5e-6);
    expect(errors[3]).toBeLessThan(2e-8);
    for (let index = 1; index < errors.length; index += 1) {
      expect(errors[index] ?? 0).toBeLessThan(errors[index - 1] ?? 0);
    }
  });

  it('has a leading term whose relative error shrinks like 15 pi / 16 / b', () => {
    const relativeErrors = [50, 100, 200, 400].map((b) => {
      const exact = deflectionByQuadrature(b);
      return (exact - weakFieldDeflection(b)) / exact;
    });
    for (let index = 1; index < relativeErrors.length; index += 1) {
      expect(relativeErrors[index] ?? 0).toBeLessThan(relativeErrors[index - 1] ?? 0);
    }
    const predicted = (15 * Math.PI) / 16 / 200;
    expect(relativeErrors[2]).toBeGreaterThan(0.9 * predicted);
    expect(relativeErrors[2]).toBeLessThan(1.1 * predicted);
  });

  it('gives 4M/b for the leading term', () => {
    expect(weakFieldDeflection(100)).toBe(0.04);
  });
});

describe('asymptoticTailDeflection', () => {
  it('scales with h cubed over r to the fourth', () => {
    expect(asymptoticTailDeflection(10, 100)).toBeCloseTo(7.5e-6, 12);
    expect(asymptoticTailDeflection(20, 100) / asymptoticTailDeflection(10, 100)).toBeCloseTo(
      8,
      12,
    );
    expect(asymptoticTailDeflection(10, 200) / asymptoticTailDeflection(10, 100)).toBeCloseTo(
      1 / 16,
      12,
    );
  });
});
