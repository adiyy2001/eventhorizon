@group(1) @binding(0) var temperatureLut: texture_2d<f32>;
@group(1) @binding(1) var skyFaces: texture_2d_array<f32>;
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
  let face = dominantFace(direction);
  let depth = dot(direction, faceForward(face));
  let u = dot(direction, faceU(face)) / depth;
  let v = dot(direction, faceV(face)) / depth;
  let stored = f32(textureDimensions(skyFaces).x);
  let inner = stored - 2.0 * f32(NEBULA_BORDER);
  let coordinates = vec2f(u, v) * (0.5 * inner / stored) + 0.5;
  return textureSampleLevel(skyFaces, skySampler, coordinates, face, 0.0).rgb;
}
