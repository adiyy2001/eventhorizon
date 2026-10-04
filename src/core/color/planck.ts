import { type Xyz, colorMatching, visibleRange } from './cmf';

export const PLANCK_CONSTANT = 6.62607015e-34;
export const SPEED_OF_LIGHT = 299792458;
export const BOLTZMANN_CONSTANT = 1.380649e-23;
export const SECOND_RADIATION_CONSTANT = (PLANCK_CONSTANT * SPEED_OF_LIGHT) / BOLTZMANN_CONSTANT;
const FIRST_RADIATION_CONSTANT_RADIANCE = 2 * PLANCK_CONSTANT * SPEED_OF_LIGHT ** 2;

export const integrationStepNanometers = 1;

export function planckSpectralRadiance(wavelengthNanometers: number, temperature: number): number {
  const wavelength = wavelengthNanometers * 1e-9;
  const exponent = SECOND_RADIATION_CONSTANT / (wavelength * temperature);
  return FIRST_RADIATION_CONSTANT_RADIANCE / (wavelength ** 5 * Math.expm1(exponent));
}

export function blackbodyXyz(temperature: number): Xyz {
  let x = 0;
  let y = 0;
  let z = 0;
  for (
    let wavelength = visibleRange.low;
    wavelength <= visibleRange.high;
    wavelength += integrationStepNanometers
  ) {
    const radiance = planckSpectralRadiance(wavelength, temperature);
    const matching = colorMatching(wavelength);
    x += radiance * matching.x;
    y += radiance * matching.y;
    z += radiance * matching.z;
  }
  const scale = integrationStepNanometers;
  return { x: x * scale, y: y * scale, z: z * scale };
}

export function chromaticity(color: Xyz): { x: number; y: number } {
  const total = color.x + color.y + color.z;
  return { x: color.x / total, y: color.y / total };
}

export function stefanBoltzmannRatio(temperature: number, referenceTemperature: number): number {
  return (temperature / referenceTemperature) ** 4;
}
