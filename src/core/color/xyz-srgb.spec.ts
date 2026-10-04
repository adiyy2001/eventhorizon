import {
  clipToGamutAtUnitLuminance,
  linearToSrgbTransfer,
  luminanceOfLinearSrgb,
  srgbToLinearTransfer,
  xyzToLinearSrgb,
} from './xyz-srgb';

describe('XYZ to linear sRGB', () => {
  it('maps the D65 white point to equal channels', () => {
    const white = xyzToLinearSrgb({ x: 0.95047, y: 1, z: 1.08883 });
    for (const channel of white) {
      expect(channel).toBeCloseTo(1, 3);
    }
  });

  it('maps the sRGB primaries to unit vectors', () => {
    const red = xyzToLinearSrgb({ x: 0.4123908, y: 0.212639, z: 0.0193308 });
    expect(red[0]).toBeCloseTo(1, 5);
    expect(red[1]).toBeCloseTo(0, 5);
    expect(red[2]).toBeCloseTo(0, 5);
  });

  it('keeps Y as the luminance of the result', () => {
    const color = xyzToLinearSrgb({ x: 0.3, y: 0.4, z: 0.2 });
    expect(luminanceOfLinearSrgb(color)).toBeCloseTo(0.4, 4);
  });
});

describe('sRGB transfer', () => {
  it('round trips values through both directions', () => {
    for (const value of [0, 0.001, 0.0031308, 0.02, 0.18, 0.5, 1]) {
      expect(srgbToLinearTransfer(linearToSrgbTransfer(value))).toBeCloseTo(value, 10);
    }
  });

  it('fixes the endpoints and middle grey', () => {
    expect(linearToSrgbTransfer(0)).toBe(0);
    expect(linearToSrgbTransfer(1)).toBeCloseTo(1, 12);
    expect(linearToSrgbTransfer(0.18)).toBeCloseTo(0.4614, 3);
  });
});

describe('gamut clipping at unit luminance', () => {
  it('removes negative channels and renormalises the luminance to one', () => {
    const clipped = clipToGamutAtUnitLuminance([2, 0.5, -0.2]);
    expect(clipped[2]).toBe(0);
    expect(luminanceOfLinearSrgb(clipped)).toBeCloseTo(1, 12);
  });

  it('returns black for a colour with no luminance', () => {
    expect(clipToGamutAtUnitLuminance([0, 0, -1])).toEqual([0, 0, 0]);
  });
});
