import { packHalfFloats } from '../core/color/half-float';
import { buildTemperatureLut } from '../core/color/temperature-lut';

export function lutTexels(): Uint16Array {
  const lut = buildTemperatureLut();
  const values = new Float32Array(lut.size * 4);
  for (let index = 0; index < lut.size; index += 1) {
    values[index * 4] = lut.rgb[index * 3] ?? 0;
    values[index * 4 + 1] = lut.rgb[index * 3 + 1] ?? 0;
    values[index * 4 + 2] = lut.rgb[index * 3 + 2] ?? 0;
    values[index * 4 + 3] = 1;
  }
  return packHalfFloats(values);
}
