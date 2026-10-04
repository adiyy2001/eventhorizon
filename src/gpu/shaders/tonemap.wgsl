const ACES_INPUT_ROW_0: vec3f = vec3f(0.59719, 0.35458, 0.04823);
const ACES_INPUT_ROW_1: vec3f = vec3f(0.07600, 0.90834, 0.01566);
const ACES_INPUT_ROW_2: vec3f = vec3f(0.02840, 0.13383, 0.83777);
const ACES_OUTPUT_ROW_0: vec3f = vec3f(1.60475, -0.53108, -0.07367);
const ACES_OUTPUT_ROW_1: vec3f = vec3f(-0.10208, 1.10813, -0.00605);
const ACES_OUTPUT_ROW_2: vec3f = vec3f(-0.00327, -0.07276, 1.07602);

fn applyRows(row0: vec3f, row1: vec3f, row2: vec3f, color: vec3f) -> vec3f {
  return vec3f(dot(row0, color), dot(row1, color), dot(row2, color));
}

fn acesCurve(value: vec3f) -> vec3f {
  let numerator = value * (value + 0.0245786) - 0.000090537;
  let denominator = value * (0.983729 * value + 0.4329510) + 0.238081;
  return numerator / denominator;
}

fn acesFitted(color: vec3f) -> vec3f {
  let mixed = applyRows(ACES_INPUT_ROW_0, ACES_INPUT_ROW_1, ACES_INPUT_ROW_2, color);
  let curved = acesCurve(mixed);
  let output = applyRows(ACES_OUTPUT_ROW_0, ACES_OUTPUT_ROW_1, ACES_OUTPUT_ROW_2, curved);
  return clamp(output, vec3f(0.0), vec3f(1.0));
}

fn encodeSrgb(linear: vec3f) -> vec3f {
  let low = linear * 12.92;
  let high = 1.055 * pow(linear, vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, linear <= vec3f(0.0031308));
}

fn displayEncode(radiance: vec3f, exposureStops: f32) -> vec3f {
  return encodeSrgb(acesFitted(radiance * exp2(exposureStops)));
}
