import { colorMatching, lobeValue, cmfLobes } from './cmf';

describe('color matching functions', () => {
  const publishedSamples: readonly [number, number, number, number][] = [
    [450, 0.3362, 0.038, 1.7826],
    [500, 0.0049, 0.323, 0.272],
    [555, 0.5121, 1.0, 0.0],
    [600, 1.0622, 0.631, 0.0008],
    [650, 0.2835, 0.107, 0.0],
  ];

  it.each(publishedSamples)(
    'stays within 0.03 of the CIE 1931 table at %d nm',
    (wavelength, x, y, z) => {
      const fit = colorMatching(wavelength);
      expect(Math.abs(fit.x - x)).toBeLessThan(0.03);
      expect(Math.abs(fit.y - y)).toBeLessThan(0.03);
      expect(Math.abs(fit.z - z)).toBeLessThan(0.03);
    },
  );

  it('peaks near 1 for the luminance function around 555 nm', () => {
    const peak = Math.max(...[540, 550, 560, 570].map((nm) => colorMatching(nm).y));
    expect(peak).toBeGreaterThan(0.97);
    expect(peak).toBeLessThan(1.03);
  });

  it('is negligible far outside the visible range', () => {
    for (const wavelength of [250, 900]) {
      const value = colorMatching(wavelength);
      expect(Math.abs(value.x)).toBeLessThan(1e-3);
      expect(Math.abs(value.y)).toBeLessThan(1e-3);
      expect(Math.abs(value.z)).toBeLessThan(1e-3);
    }
  });

  it('uses the lower slope below the lobe center and the upper slope above it', () => {
    const lobe = cmfLobes.y[0];
    if (lobe === undefined) {
      throw new Error('missing lobe');
    }
    expect(lobeValue(lobe, lobe.center)).toBeCloseTo(lobe.amplitude, 12);
    const below = lobeValue(lobe, lobe.center - 20);
    const above = lobeValue(lobe, lobe.center + 20);
    expect(below).toBeCloseTo(lobe.amplitude * Math.exp(-0.5 * (20 * lobe.lowSlope) ** 2), 12);
    expect(above).toBeCloseTo(lobe.amplitude * Math.exp(-0.5 * (20 * lobe.highSlope) ** 2), 12);
  });
});
