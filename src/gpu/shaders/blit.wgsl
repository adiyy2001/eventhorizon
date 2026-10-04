@group(0) @binding(0) var radiance: texture_2d<f32>;

struct BlitOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> BlitOutput {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  var output: BlitOutput;
  output.position = vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
  output.uv = vec2f(corner.x, 1.0 - corner.y);
  return output;
}

fn encodeSrgb(linear: vec3f) -> vec3f {
  let low = linear * 12.92;
  let high = 1.055 * pow(linear, vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, linear <= vec3f(0.0031308));
}

@fragment
fn fragmentMain(input: BlitOutput) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(radiance));
  let texel = vec2u(clamp(input.uv * size, vec2f(0.0), size - vec2f(1.0)));
  let color = textureLoad(radiance, texel, 0).rgb;
  let mapped = 1.0 - exp(-color);
  return vec4f(encodeSrgb(mapped), 1.0);
}
