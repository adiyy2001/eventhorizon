@group(0) @binding(0) var<uniform> params: TraceParams;
@group(0) @binding(1) var radiance: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<storage, read_write> outcomes: array<u32>;

fn diskRadiance(result: TraceResult) -> vec3f {
  let redshift = redshiftFactor(result.hitRadius, result.hitLambda, params);
  let emitted = params.peakTemperature * diskTemperatureRatio(result.hitRadius, params.diskInner);
  return blackbodyRadiance(emitted * redshift);
}

fn skyRadiance(direction: vec3f) -> vec3f {
  return nebulaSample(direction) + starRadiance(direction);
}

fn shadeResult(result: TraceResult) -> vec3f {
  if (result.outcome == OUTCOME_DISK) {
    return diskRadiance(result);
  }
  if (result.outcome == OUTCOME_ESCAPED) {
    return skyRadiance(result.direction);
  }
  return vec3f(0.0);
}

@compute @workgroup_size(8, 8)
fn renderImage(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.width || id.y >= params.height) {
    return;
  }
  let pixel = vec2f(f32(id.x) + 0.5 + params.jitterX, f32(id.y) + 0.5 + params.jitterY);
  let direction = pixelDirection(params, pixel);
  let result = traceRay(staticObserverRay(params.cameraPosition, direction), params);
  let color = shadeResult(result);
  textureStore(radiance, vec2u(id.x, id.y), vec4f(color, 1.0));
  outcomes[id.y * params.width + id.x] = result.outcome;
}
