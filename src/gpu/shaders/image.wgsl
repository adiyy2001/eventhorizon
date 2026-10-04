@group(0) @binding(0) var<uniform> params: TraceParams;
@group(0) @binding(1) var radiance: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<storage, read_write> outcomes: array<u32>;
@group(0) @binding(3) var overlay: texture_storage_2d<rgba16float, write>;

fn diskRadiance(result: TraceResult, pixelParams: TraceParams) -> vec3f {
  let redshift = redshiftFactor(result.hitRadius, result.hitLambda, pixelParams);
  let emitted = pixelParams.peakTemperature * diskTemperatureRatio(result.hitRadius, pixelParams.diskInner);
  return blackbodyRadiance(emitted * redshift);
}

fn skyRadiance(direction: vec3f) -> vec3f {
  return nebulaSample(direction) + starRadiance(direction);
}

fn shadeResult(result: TraceResult, pixelParams: TraceParams) -> vec3f {
  if (result.outcome == OUTCOME_DISK) {
    return diskRadiance(result, pixelParams);
  }
  if (result.outcome == OUTCOME_ESCAPED) {
    return skyRadiance(result.direction);
  }
  return vec3f(0.0);
}

fn paramsForPixel(column: u32) -> TraceParams {
  var pixelParams = params;
  if (f32(column) + 0.5 >= params.splitColumn) {
    pixelParams.flags = params.flagsRight;
  }
  return pixelParams;
}

@compute @workgroup_size(8, 8)
fn renderImage(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.width || id.y >= params.height) {
    return;
  }
  let pixelParams = paramsForPixel(id.x);
  overlayHits = 0u;
  let pixel = vec2f(f32(id.x) + 0.5 + params.jitterX, f32(id.y) + 0.5 + params.jitterY);
  let direction = pixelDirection(pixelParams, pixel);
  let result = traceRay(staticObserverRay(pixelParams.cameraPosition, direction), pixelParams);
  let color = shadeResult(result, pixelParams);
  let sphere = f32((overlayHits & OVERLAY_PHOTON_SPHERE) != 0u);
  let ring = f32((overlayHits & OVERLAY_ISCO) != 0u);
  textureStore(radiance, vec2u(id.x, id.y), vec4f(color, 1.0));
  textureStore(overlay, vec2u(id.x, id.y), vec4f(sphere, ring, 0.0, 1.0));
  outcomes[id.y * params.width + id.x] = result.outcome;
}
