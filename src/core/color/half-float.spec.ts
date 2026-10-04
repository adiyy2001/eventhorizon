import { fromHalfBits, packHalfFloats, toHalfBits } from './half-float';

describe('half float conversion', () => {
  it('encodes known values', () => {
    expect(toHalfBits(0)).toBe(0x0000);
    expect(toHalfBits(-0)).toBe(0x8000);
    expect(toHalfBits(1)).toBe(0x3c00);
    expect(toHalfBits(-2)).toBe(0xc000);
    expect(toHalfBits(0.5)).toBe(0x3800);
    expect(toHalfBits(65504)).toBe(0x7bff);
    expect(toHalfBits(1e6)).toBe(0x7c00);
    expect(toHalfBits(Number.NaN)).toBe(0x7e00);
    expect(toHalfBits(2 ** -24)).toBe(0x0001);
    expect(toHalfBits(1e-9)).toBe(0x0000);
  });

  it('rounds half to even', () => {
    expect(toHalfBits(1 + 2 ** -11)).toBe(0x3c00);
    expect(toHalfBits(1 + 3 * 2 ** -11)).toBe(0x3c02);
  });

  it('round trips every finite half float bit pattern', () => {
    for (let bits = 0; bits < 0x10000; bits += 1) {
      const exponent = (bits >>> 10) & 0x1f;
      if (exponent === 31) {
        continue;
      }
      expect(toHalfBits(fromHalfBits(bits))).toBe(bits);
    }
  });

  it('decodes infinity and NaN', () => {
    expect(fromHalfBits(0x7c00)).toBe(Infinity);
    expect(fromHalfBits(0xfc00)).toBe(-Infinity);
    expect(fromHalfBits(0x7e00)).toBeNaN();
  });

  it('keeps the relative error below 2^-11 for normal values', () => {
    for (const value of [0.00123, 0.3, 1.7, 99.9, 12345]) {
      const decoded = fromHalfBits(toHalfBits(value));
      expect(Math.abs(decoded - value) / value).toBeLessThanOrEqual(2 ** -11);
    }
  });

  it('packs arrays', () => {
    expect([...packHalfFloats([1, 0.5, -2])]).toEqual([0x3c00, 0x3800, 0xc000]);
  });
});
