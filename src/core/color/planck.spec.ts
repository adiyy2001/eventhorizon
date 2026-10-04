import {
  blackbodyXyz,
  chromaticity,
  planckSpectralRadiance,
  SECOND_RADIATION_CONSTANT,
  stefanBoltzmannRatio,
} from './planck';

describe('Planck spectrum', () => {
  it('derives the second radiation constant from the exact SI values', () => {
    expect(Math.abs(SECOND_RADIATION_CONSTANT / 1.438776877e-2 - 1)).toBeLessThan(1e-9);
  });

  it('peaks where Wien displacement law says', () => {
    const temperature = 5000;
    let bestWavelength = 0;
    let best = 0;
    for (let wavelength = 200; wavelength <= 2000; wavelength += 1) {
      const radiance = planckSpectralRadiance(wavelength, temperature);
      if (radiance > best) {
        best = radiance;
        bestWavelength = wavelength;
      }
    }
    expect(Math.abs(bestWavelength - 2897771.955 / temperature)).toBeLessThan(1.5);
  });

  it('grows with temperature at every wavelength', () => {
    for (const wavelength of [400, 550, 700]) {
      expect(planckSpectralRadiance(wavelength, 6000)).toBeGreaterThan(
        planckSpectralRadiance(wavelength, 5000),
      );
    }
  });

  it('scales the bolometric flux with the fourth power of the temperature', () => {
    expect(stefanBoltzmannRatio(13000, 6500)).toBe(16);
    expect(stefanBoltzmannRatio(3250, 6500)).toBeCloseTo(1 / 16, 12);
  });
});

describe('blackbody chromaticity', () => {
  const planckianLocus: readonly [number, number, number][] = [
    [2000, 0.5267, 0.4133],
    [3000, 0.4369, 0.4041],
    [4000, 0.3804, 0.3767],
    [5000, 0.3451, 0.3516],
    [6500, 0.3135, 0.3236],
    [10000, 0.2806, 0.2883],
  ];

  it.each(planckianLocus)('matches the Planckian locus at %d K within 3e-3', (kelvin, x, y) => {
    const point = chromaticity(blackbodyXyz(kelvin));
    expect(Math.abs(point.x - x)).toBeLessThan(3e-3);
    expect(Math.abs(point.y - y)).toBeLessThan(3e-3);
  });

  it('states the larger error of the fit at 1500 K and stays within 6e-3 there', () => {
    const point = chromaticity(blackbodyXyz(1500));
    expect(Math.abs(point.x - 0.5857)).toBeLessThan(6e-3);
    expect(Math.abs(point.y - 0.3931)).toBeLessThan(6e-3);
  });

  it('moves from red to blue as the temperature rises', () => {
    const cool = chromaticity(blackbodyXyz(2500));
    const hot = chromaticity(blackbodyXyz(20000));
    expect(cool.x).toBeGreaterThan(hot.x);
  });
});
