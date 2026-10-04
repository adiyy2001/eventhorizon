import { FBM_GAIN, FBM_LACUNARITY, FBM_OCTAVES } from '../core/background/noise';
import { NEBULA_BAND_WIDTH, NEBULA_CLOUD_GAIN, NEBULA_GLOW_GAIN } from '../core/background/nebula';
import { FACE_COUNT } from '../core/background/cube-faces';
import {
  STAR_CELLS_PER_EDGE,
  STAR_FACE_MARGIN,
  STAR_FLUX_EXPONENT,
  STAR_PEAK_DENSITY,
  STAR_PEAK_MAX,
  STAR_PEAK_MIN,
  STAR_SEED,
  STAR_SIGMA,
  STAR_TEMPERATURE_MIN,
  STAR_TEMPERATURE_RATIO,
} from '../core/background/stars';
import {
  LUT_MAX_TEMPERATURE,
  LUT_MIN_TEMPERATURE,
  LUT_SIZE,
  REFERENCE_TEMPERATURE,
} from '../core/color/temperature-lut';
import { compiledShaders } from './shader-modules';

function scalarConstants(source: string): Record<string, number> {
  const constants: Record<string, number> = {};
  const pattern = /^const (\w+): (?:f32|u32|i32) = (-?[\d.]+)u?;$/gm;
  for (const match of source.matchAll(pattern)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      constants[name] = Number(value);
    }
  }
  return constants;
}

const wgsl = scalarConstants(Object.values(compiledShaders).join('\n'));

function expectConstant(name: string, expected: number): void {
  const actual = wgsl[name];
  expect(actual, name).toBeDefined();
  expect(actual ?? Number.NaN, name).toBeCloseTo(expected, 10);
}

describe('WGSL constants against their TypeScript twins', () => {
  it('matches the star field parameters', () => {
    expectConstant('STAR_CELLS_PER_EDGE', STAR_CELLS_PER_EDGE);
    expectConstant('STAR_PEAK_DENSITY', STAR_PEAK_DENSITY);
    expectConstant('STAR_SIGMA', STAR_SIGMA);
    expectConstant('STAR_PEAK_MIN', STAR_PEAK_MIN);
    expectConstant('STAR_PEAK_MAX', STAR_PEAK_MAX);
    expectConstant('STAR_FLUX_EXPONENT', STAR_FLUX_EXPONENT);
    expectConstant('STAR_TEMPERATURE_MIN', STAR_TEMPERATURE_MIN);
    expectConstant('STAR_TEMPERATURE_RATIO', STAR_TEMPERATURE_RATIO);
    expectConstant('STAR_FACE_MARGIN', STAR_FACE_MARGIN);
    expectConstant('STAR_SEED', STAR_SEED);
  });

  it('matches the nebula and noise parameters', () => {
    expectConstant('NEBULA_BAND_WIDTH', NEBULA_BAND_WIDTH);
    expectConstant('NEBULA_CLOUD_GAIN', NEBULA_CLOUD_GAIN);
    expectConstant('NEBULA_GLOW_GAIN', NEBULA_GLOW_GAIN);
    expectConstant('FBM_OCTAVES', FBM_OCTAVES);
    expectConstant('FBM_LACUNARITY', FBM_LACUNARITY);
    expectConstant('FBM_GAIN', FBM_GAIN);
    expectConstant('FACE_COUNT', FACE_COUNT);
  });

  it('matches the temperature lookup table range', () => {
    expectConstant('LUT_SIZE', LUT_SIZE);
    expectConstant('LUT_MIN_TEMPERATURE', LUT_MIN_TEMPERATURE);
    expectConstant('LUT_TEMPERATURE_SPAN', LUT_MAX_TEMPERATURE / LUT_MIN_TEMPERATURE);
    expectConstant('REFERENCE_TEMPERATURE', REFERENCE_TEMPERATURE);
  });
});
