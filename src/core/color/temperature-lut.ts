import { blackbodyXyz } from './planck';
import { clipToGamutAtUnitLuminance, type Rgb, xyzToLinearSrgb } from './xyz-srgb';

export const LUT_SIZE = 1024;
export const LUT_MIN_TEMPERATURE = 1000;
export const LUT_MAX_TEMPERATURE = 100000;
export const REFERENCE_TEMPERATURE = 6500;

export interface TemperatureLut {
  size: number;
  minTemperature: number;
  maxTemperature: number;
  rgb: Float32Array;
  relativeLuminance: Float32Array;
}

const logSpan = Math.log(LUT_MAX_TEMPERATURE / LUT_MIN_TEMPERATURE);

export function lutPosition(temperature: number): number {
  const clamped = Math.min(Math.max(temperature, LUT_MIN_TEMPERATURE), LUT_MAX_TEMPERATURE);
  return Math.log(clamped / LUT_MIN_TEMPERATURE) / logSpan;
}

export function lutTemperature(index: number, size = LUT_SIZE): number {
  return LUT_MIN_TEMPERATURE * Math.exp((logSpan * index) / (size - 1));
}

export function unitLuminanceColor(temperature: number): Rgb {
  return clipToGamutAtUnitLuminance(xyzToLinearSrgb(blackbodyXyz(temperature)));
}

export function buildTemperatureLut(size = LUT_SIZE): TemperatureLut {
  const rgb = new Float32Array(size * 3);
  const relativeLuminance = new Float32Array(size);
  const reference = blackbodyXyz(REFERENCE_TEMPERATURE).y;
  for (let index = 0; index < size; index += 1) {
    const temperature = lutTemperature(index, size);
    const color = unitLuminanceColor(temperature);
    rgb.set(color, index * 3);
    relativeLuminance[index] = blackbodyXyz(temperature).y / reference;
  }
  return {
    size,
    minTemperature: LUT_MIN_TEMPERATURE,
    maxTemperature: LUT_MAX_TEMPERATURE,
    rgb,
    relativeLuminance,
  };
}

export function sampleLut(lut: TemperatureLut, temperature: number): Rgb {
  const position = lutPosition(temperature) * (lut.size - 1);
  const lower = Math.min(Math.floor(position), lut.size - 2);
  const fraction = position - lower;
  const channel = (index: number, component: number): number => lut.rgb[index * 3 + component] ?? 0;
  return [
    channel(lower, 0) * (1 - fraction) + channel(lower + 1, 0) * fraction,
    channel(lower, 1) * (1 - fraction) + channel(lower + 1, 1) * fraction,
    channel(lower, 2) * (1 - fraction) + channel(lower + 1, 2) * fraction,
  ];
}

export function blackbodyRadiance(lut: TemperatureLut, temperature: number): Rgb {
  const color = sampleLut(lut, temperature);
  const scale = (temperature / REFERENCE_TEMPERATURE) ** 4;
  return [color[0] * scale, color[1] * scale, color[2] * scale];
}
