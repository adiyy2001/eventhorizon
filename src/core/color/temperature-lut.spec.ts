import {
  blackbodyRadiance,
  buildTemperatureLut,
  LUT_MAX_TEMPERATURE,
  LUT_MIN_TEMPERATURE,
  LUT_SIZE,
  lutPosition,
  lutTemperature,
  REFERENCE_TEMPERATURE,
  sampleLut,
  unitLuminanceColor,
} from './temperature-lut';
import { luminanceOfLinearSrgb } from './xyz-srgb';

describe('temperature lookup table', () => {
  const lut = buildTemperatureLut();

  it('spans 1000 K to 100000 K in 1024 log-spaced entries', () => {
    expect(lut.size).toBe(LUT_SIZE);
    expect(lutTemperature(0)).toBeCloseTo(LUT_MIN_TEMPERATURE, 9);
    expect(lutTemperature(LUT_SIZE - 1)).toBeCloseTo(LUT_MAX_TEMPERATURE, 6);
    const ratioA = lutTemperature(11) / lutTemperature(10);
    const ratioB = lutTemperature(900) / lutTemperature(899);
    expect(ratioA).toBeCloseTo(ratioB, 12);
  });

  it('maps temperatures to positions and clamps outside the range', () => {
    expect(lutPosition(LUT_MIN_TEMPERATURE)).toBe(0);
    expect(lutPosition(LUT_MAX_TEMPERATURE)).toBeCloseTo(1, 12);
    expect(lutPosition(10)).toBe(0);
    expect(lutPosition(1e7)).toBe(1);
    expect(lutPosition(10000)).toBeCloseTo(0.5, 12);
  });

  it('stores colours at unit luminance', () => {
    for (const index of [0, 100, 512, 900, 1023]) {
      const color: [number, number, number] = [
        lut.rgb[index * 3] ?? 0,
        lut.rgb[index * 3 + 1] ?? 0,
        lut.rgb[index * 3 + 2] ?? 0,
      ];
      expect(luminanceOfLinearSrgb(color)).toBeCloseTo(1, 5);
    }
  });

  it('agrees with direct integration within 1e-3 between the entries', () => {
    for (const temperature of [1234, 2750, 4100, 6500, 9000, 15500, 33333, 87000]) {
      const interpolated = sampleLut(lut, temperature);
      const direct = unitLuminanceColor(temperature);
      for (let channel = 0; channel < 3; channel += 1) {
        const expected = direct[channel] ?? 0;
        const actual = interpolated[channel] ?? 0;
        expect(Math.abs(actual - expected) / Math.max(expected, 1e-3)).toBeLessThan(1e-3);
      }
    }
  });

  it('turns from red to blue with rising temperature', () => {
    const cool = sampleLut(lut, 2000);
    const hot = sampleLut(lut, 20000);
    expect(cool[0]).toBeGreaterThan(cool[2]);
    expect(hot[2]).toBeGreaterThan(hot[0]);
  });

  it('normalises the visible luminance to 1 at the reference temperature', () => {
    const index = Math.round(lutPosition(REFERENCE_TEMPERATURE) * (LUT_SIZE - 1));
    expect(lut.relativeLuminance[index]).toBeCloseTo(1, 2);
    expect(lut.relativeLuminance[LUT_SIZE - 1]).toBeGreaterThan(lut.relativeLuminance[index] ?? 0);
  });

  it('shows why the bolometric scale grows faster than the visible luminance for hot gas', () => {
    const hotIndex = Math.round(lutPosition(26000) * (LUT_SIZE - 1));
    const visible = lut.relativeLuminance[hotIndex] ?? 0;
    expect(visible).toBeLessThan((26000 / REFERENCE_TEMPERATURE) ** 4);
  });

  it('scales radiance with the fourth power of temperature', () => {
    const base = blackbodyRadiance(lut, REFERENCE_TEMPERATURE);
    expect(luminanceOfLinearSrgb(base)).toBeCloseTo(1, 3);
    const doubled = blackbodyRadiance(lut, 2 * REFERENCE_TEMPERATURE);
    expect(luminanceOfLinearSrgb(doubled)).toBeCloseTo(16, 1);
  });
});
