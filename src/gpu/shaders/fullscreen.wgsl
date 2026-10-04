struct FullscreenOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> FullscreenOutput {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  var output: FullscreenOutput;
  output.position = vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
  output.uv = vec2f(corner.x, 1.0 - corner.y);
  return output;
}
