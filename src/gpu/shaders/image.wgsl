@group(0) @binding(0) var<uniform> params: TraceParams;
@group(0) @binding(1) var radiance: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<storage, read_write> outcomes: array<u32>;

const CHECKER_CELLS: f32 = 8.0;
const CHECKER_BRIGHT: f32 = 0.3;
const CHECKER_DARK: f32 = 0.1;

fn checkerShade(direction: vec3f) -> f32 {
  let azimuthCell = floor(CHECKER_CELLS * atan2(direction.z, direction.x) / TAU);
  let elevationCell = floor(CHECKER_CELLS * asin(clamp(direction.y, -1.0, 1.0)) / PI);
  if (((i32(azimuthCell) + i32(elevationCell)) & 1) == 0) {
    return CHECKER_BRIGHT;
  }
  return CHECKER_DARK;
}

fn diskShade(result: TraceResult) -> f32 {
  let redshift = redshiftFactor(result.hitRadius, result.hitLambda, params);
  let shape = diskTemperatureRatio(result.hitRadius, params.diskInner);
  let observed = redshift * shape;
  let squared = observed * observed;
  return squared * squared;
}

fn placeholderShade(result: TraceResult) -> f32 {
  if (result.outcome == OUTCOME_DISK) {
    return diskShade(result);
  }
  if (result.outcome == OUTCOME_ESCAPED) {
    return checkerShade(result.direction);
  }
  return 0.0;
}

@compute @workgroup_size(8, 8)
fn renderImage(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.width || id.y >= params.height) {
    return;
  }
  let pixel = vec2f(f32(id.x) + 0.5 + params.jitterX, f32(id.y) + 0.5 + params.jitterY);
  let direction = pixelDirection(params, pixel);
  let result = traceRay(staticObserverRay(params.cameraPosition, direction), params);
  let shade = placeholderShade(result);
  textureStore(radiance, vec2u(id.x, id.y), vec4f(shade, shade, shade, 1.0));
  outcomes[id.y * params.width + id.x] = result.outcome;
}
