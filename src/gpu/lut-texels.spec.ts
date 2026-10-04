import { fromHalfBits } from '../core/color/half-float';
import { buildTemperatureLut, LUT_SIZE } from '../core/color/temperature-lut';
import { lutTexels } from './lut-texels';

describe('lutTexels', () => {
  const texels = lutTexels();
  const lut = buildTemperatureLut();

  it('holds four half floats for every table entry', () => {
    expect(texels).toHaveLength(LUT_SIZE * 4);
  });

  it('decodes to the table colours within half float precision and an alpha of one', () => {
    for (const index of [0, 1, 300, 777, LUT_SIZE - 1]) {
      for (let channel = 0; channel < 3; channel += 1) {
        const expected = lut.rgb[index * 3 + channel] ?? 0;
        const decoded = fromHalfBits(texels[index * 4 + channel] ?? 0);
        expect(Math.abs(decoded - expected)).toBeLessThanOrEqual(
          Math.max(expected, 1e-4) * 2 ** -10,
        );
      }
      expect(fromHalfBits(texels[index * 4 + 3] ?? 0)).toBe(1);
    }
  });
});
