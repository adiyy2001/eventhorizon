@group(1) @binding(0) var temperatureLut: texture_2d<f32>;
@group(1) @binding(1) var skyCube: texture_cube<f32>;
@group(1) @binding(2) var skySampler: sampler;

const LUT_SIZE: f32 = 1024.0;
const LUT_MIN_TEMPERATURE: f32 = 1000.0;
const LUT_TEMPERATURE_SPAN: f32 = 100.0;
const REFERENCE_TEMPERATURE: f32 = 6500.0;

fn lutCoordinate(temperature: f32) -> f32 {
  let position = clamp(log(max(temperature, 1.0) / LUT_MIN_TEMPERATURE) / log(LUT_TEMPERATURE_SPAN), 0.0, 1.0);
  return (0.5 + position * (LUT_SIZE - 1.0)) / LUT_SIZE;
}

fn lutColor(temperature: f32) -> vec3f {
  return textureSampleLevel(temperatureLut, skySampler, vec2f(lutCoordinate(temperature), 0.5), 0.0).rgb;
}

fn blackbodyRadiance(temperature: f32) -> vec3f {
  let ratio = temperature / REFERENCE_TEMPERATURE;
  let squared = ratio * ratio;
  return lutColor(temperature) * squared * squared;
}

fn nebulaSample(direction: vec3f) -> vec3f {
  return textureSampleLevel(skyCube, skySampler, direction, 0.0).rgb;
}
