@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var bloomSampler: sampler;
@group(0) @binding(2) var<uniform> region: vec4f;

fn tap(uv: vec2f, offset: vec2f) -> vec3f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  let valid = region.xy;
  let position = clamp(uv * valid + offset * texel, 0.5 * texel, valid - 0.5 * texel);
  return textureSampleLevel(source, bloomSampler, position, 0.0).rgb;
}

fn karisWeight(color: vec3f) -> f32 {
  return 1.0 / (1.0 + dot(color, vec3f(0.2126, 0.7152, 0.0722)));
}

fn karisGroup(first: vec3f, second: vec3f, third: vec3f, fourth: vec3f) -> vec3f {
  let average = 0.25 * (first + second + third + fourth);
  return average * karisWeight(average);
}

@fragment
fn downsampleFirst(input: FullscreenOutput) -> @location(0) vec4f {
  let a = tap(input.uv, vec2f(-2.0, 2.0));
  let b = tap(input.uv, vec2f(0.0, 2.0));
  let c = tap(input.uv, vec2f(2.0, 2.0));
  let d = tap(input.uv, vec2f(-2.0, 0.0));
  let e = tap(input.uv, vec2f(0.0, 0.0));
  let f = tap(input.uv, vec2f(2.0, 0.0));
  let g = tap(input.uv, vec2f(-2.0, -2.0));
  let h = tap(input.uv, vec2f(0.0, -2.0));
  let i = tap(input.uv, vec2f(2.0, -2.0));
  let j = tap(input.uv, vec2f(-1.0, 1.0));
  let k = tap(input.uv, vec2f(1.0, 1.0));
  let l = tap(input.uv, vec2f(-1.0, -1.0));
  let m = tap(input.uv, vec2f(1.0, -1.0));
  let center = karisGroup(j, k, l, m);
  let topLeft = karisGroup(a, b, d, e);
  let topRight = karisGroup(b, c, e, f);
  let bottomLeft = karisGroup(d, e, g, h);
  let bottomRight = karisGroup(e, f, h, i);
  let total = 0.5 * center + 0.125 * (topLeft + topRight + bottomLeft + bottomRight);
  return vec4f(total, 1.0);
}

@fragment
fn downsample(input: FullscreenOutput) -> @location(0) vec4f {
  let a = tap(input.uv, vec2f(-2.0, 2.0));
  let b = tap(input.uv, vec2f(0.0, 2.0));
  let c = tap(input.uv, vec2f(2.0, 2.0));
  let d = tap(input.uv, vec2f(-2.0, 0.0));
  let e = tap(input.uv, vec2f(0.0, 0.0));
  let f = tap(input.uv, vec2f(2.0, 0.0));
  let g = tap(input.uv, vec2f(-2.0, -2.0));
  let h = tap(input.uv, vec2f(0.0, -2.0));
  let i = tap(input.uv, vec2f(2.0, -2.0));
  let j = tap(input.uv, vec2f(-1.0, 1.0));
  let k = tap(input.uv, vec2f(1.0, 1.0));
  let l = tap(input.uv, vec2f(-1.0, -1.0));
  let m = tap(input.uv, vec2f(1.0, -1.0));
  let total = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  return vec4f(total, 1.0);
}

@fragment
fn upsample(input: FullscreenOutput) -> @location(0) vec4f {
  let corners = tap(input.uv, vec2f(-1.0, 1.0)) + tap(input.uv, vec2f(1.0, 1.0))
    + tap(input.uv, vec2f(-1.0, -1.0)) + tap(input.uv, vec2f(1.0, -1.0));
  let edges = tap(input.uv, vec2f(0.0, 1.0)) + tap(input.uv, vec2f(0.0, -1.0))
    + tap(input.uv, vec2f(1.0, 0.0)) + tap(input.uv, vec2f(-1.0, 0.0));
  let center = tap(input.uv, vec2f(0.0, 0.0));
  return vec4f((corners + 2.0 * edges + 4.0 * center) / 16.0, 1.0);
}
