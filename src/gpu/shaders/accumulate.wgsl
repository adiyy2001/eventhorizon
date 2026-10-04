const RESOLVED_MAX: f32 = 60000.0;

struct AccumulateParams {
  width: u32,
  height: u32,
  weight: f32,
  padding: u32,
}

@group(0) @binding(0) var<uniform> accumulation: AccumulateParams;
@group(0) @binding(1) var current: texture_2d<f32>;
@group(0) @binding(2) var history: texture_2d<f32>;
@group(0) @binding(3) var blended: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var resolved: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var overlayCurrent: texture_2d<f32>;
@group(0) @binding(6) var overlayHistory: texture_2d<f32>;
@group(0) @binding(7) var overlayBlended: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn accumulate(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= accumulation.width || id.y >= accumulation.height) {
    return;
  }
  let texel = vec2u(id.x, id.y);
  let fresh = textureLoad(current, texel, 0);
  let previous = textureLoad(history, texel, 0);
  let restart = accumulation.weight >= 1.0;
  let average = select(mix(previous, fresh, accumulation.weight), fresh, restart);
  textureStore(blended, texel, average);
  textureStore(resolved, texel, vec4f(clamp(average.rgb, vec3f(0.0), vec3f(RESOLVED_MAX)), 1.0));
  let overlayFresh = textureLoad(overlayCurrent, texel, 0);
  let overlayAverage = select(mix(textureLoad(overlayHistory, texel, 0), overlayFresh, accumulation.weight), overlayFresh, restart);
  textureStore(overlayBlended, texel, overlayAverage);
}
