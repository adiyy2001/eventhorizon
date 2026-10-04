const HALF_MAX_FINITE_ROUNDING_LIMIT = 65520;
const HALF_SUBNORMAL_LIMIT = 2 ** -14;
const HALF_INFINITY_BITS = 0x7c00;
const HALF_QUIET_NAN_BITS = 0x7e00;

function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const difference = value - floor;
  if (difference < 0.5) {
    return floor;
  }
  if (difference > 0.5) {
    return floor + 1;
  }
  return floor % 2 === 0 ? floor : floor + 1;
}

function exponentOf(magnitude: number): number {
  let exponent = Math.floor(Math.log2(magnitude));
  if (2 ** exponent > magnitude) {
    exponent -= 1;
  } else if (2 ** (exponent + 1) <= magnitude) {
    exponent += 1;
  }
  return exponent;
}

export function toHalfBits(value: number): number {
  if (Number.isNaN(value)) {
    return HALF_QUIET_NAN_BITS;
  }
  const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0;
  const magnitude = Math.abs(value);
  if (magnitude >= HALF_MAX_FINITE_ROUNDING_LIMIT) {
    return sign | HALF_INFINITY_BITS;
  }
  if (magnitude < HALF_SUBNORMAL_LIMIT) {
    return sign | roundHalfToEven(magnitude * 2 ** 24);
  }
  let exponent = exponentOf(magnitude);
  let mantissa = roundHalfToEven((magnitude / 2 ** exponent - 1) * 1024);
  if (mantissa === 1024) {
    exponent += 1;
    mantissa = 0;
  }
  return sign | ((exponent + 15) << 10) | mantissa;
}

export function fromHalfBits(bits: number): number {
  const sign = (bits & 0x8000) !== 0 ? -1 : 1;
  const exponent = (bits >>> 10) & 0x1f;
  const mantissa = bits & 0x3ff;
  if (exponent === 0) {
    return sign * mantissa * 2 ** -24;
  }
  if (exponent === 31) {
    return mantissa === 0 ? sign * Infinity : Number.NaN;
  }
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

export function packHalfFloats(values: ArrayLike<number>): Uint16Array {
  const packed = new Uint16Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    packed[index] = toHalfBits(values[index] ?? 0);
  }
  return packed;
}
