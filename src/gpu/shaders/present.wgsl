struct PresentParams {
  exposure: f32,
  bloomStrength: f32,
  ditherAmplitude: f32,
  padding: f32,
}

@group(0) @binding(0) var<uniform> present: PresentParams;
@group(0) @binding(1) var hdr: texture_2d<f32>;
@group(0) @binding(2) var bloomTexture: texture_2d<f32>;
@group(0) @binding(3) var presentSampler: sampler;

fn ditherNoise(position: vec2f) -> f32 {
  let cell = vec2u(position);
  let first = unitFloat(hash3(cell.x, cell.y, 0u, 101u));
  let second = unitFloat(hash3(cell.x, cell.y, 1u, 202u));
  return first + second - 1.0;
}

@fragment
fn fragmentMain(input: FullscreenOutput) -> @location(0) vec4f {
  let scene = textureSampleLevel(hdr, presentSampler, input.uv, 0.0).rgb;
  let glow = textureSampleLevel(bloomTexture, presentSampler, input.uv, 0.0).rgb;
  let encoded = displayEncode(scene + present.bloomStrength * glow, present.exposure);
  let dithered = encoded + vec3f(present.ditherAmplitude * ditherNoise(input.position.xy) / 255.0);
  return vec4f(clamp(dithered, vec3f(0.0), vec3f(1.0)), 1.0);
}
