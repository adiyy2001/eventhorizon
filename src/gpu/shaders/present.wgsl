const SPHERE_COLOR: vec3f = vec3f(0.35, 0.85, 1.0);
const RING_COLOR: vec3f = vec3f(1.0, 0.55, 0.85);
const SHADOW_COLOR: vec3f = vec3f(0.65, 1.0, 0.5);
const DIVIDER_COLOR: vec3f = vec3f(1.0, 1.0, 1.0);
const DIVIDER_OUTLINE: vec3f = vec3f(0.05, 0.05, 0.08);
const HANDLE_RADIUS_PIXELS: f32 = 13.0;
const OVERLAY_OPACITY: f32 = 0.95;

struct PresentParams {
  exposure: f32,
  bloomStrength: f32,
  ditherAmplitude: f32,
  splitPosition: f32,
  validU: f32,
  validV: f32,
  halfWidth: f32,
  halfHeight: f32,
  shadowTangent: f32,
  targetWidth: f32,
  targetHeight: f32,
  padding: f32,
}

@group(0) @binding(0) var<uniform> present: PresentParams;
@group(0) @binding(1) var hdr: texture_2d<f32>;
@group(0) @binding(2) var bloomTexture: texture_2d<f32>;
@group(0) @binding(3) var presentSampler: sampler;
@group(0) @binding(4) var overlayTexture: texture_2d<f32>;

fn ditherNoise(position: vec2f) -> f32 {
  let cell = vec2u(position);
  let first = unitFloat(hash3(cell.x, cell.y, 0u, 101u));
  let second = unitFloat(hash3(cell.x, cell.y, 1u, 202u));
  return first + second - 1.0;
}

fn imageUv(uv: vec2f) -> vec2f {
  let valid = vec2f(present.validU, present.validV);
  let halfTexel = 0.5 / vec2f(textureDimensions(hdr));
  return clamp(uv * valid, halfTexel, valid - halfTexel);
}

fn shadowEdgeCoverage(uv: vec2f) -> f32 {
  if (present.shadowTangent <= 0.0) {
    return 0.0;
  }
  let tangent = vec2f((2.0 * uv.x - 1.0) * present.halfWidth, (1.0 - 2.0 * uv.y) * present.halfHeight);
  let pixelTangent = 2.0 * present.halfHeight / present.targetHeight;
  let distancePixels = abs(length(tangent) - present.shadowTangent) / pixelTangent;
  return 1.0 - smoothstep(0.6, 1.6, distancePixels);
}

fn dividerCoverage(position: vec2f) -> vec2f {
  if (present.splitPosition < 0.0) {
    return vec2f(0.0);
  }
  let centerX = present.splitPosition * present.targetWidth;
  let offsetX = abs(position.x - centerX);
  let centerY = 0.5 * present.targetHeight;
  let toHandle = length(vec2f(position.x - centerX, position.y - centerY));
  let line = 1.0 - smoothstep(1.0, 2.0, offsetX);
  let outline = 1.0 - smoothstep(2.0, 3.2, offsetX);
  let handleFill = 1.0 - smoothstep(HANDLE_RADIUS_PIXELS - 1.0, HANDLE_RADIUS_PIXELS, toHandle);
  let handleRing = 1.0 - smoothstep(1.2, 2.2, abs(toHandle - HANDLE_RADIUS_PIXELS));
  let reach = abs(position.x - centerX);
  let arrows = f32(reach > 3.0 && reach < 8.0 && abs(position.y - centerY) < (8.0 - reach) * 0.9);
  let body = max(line, max(handleRing, arrows * handleFill));
  let backdrop = max(outline, handleFill);
  return vec2f(body, backdrop);
}

fn compositeOverlays(base: vec3f, uv: vec2f, position: vec2f) -> vec3f {
  let marks = textureSampleLevel(overlayTexture, presentSampler, imageUv(uv), 0.0).rg;
  var color = base;
  color = mix(color, SPHERE_COLOR, OVERLAY_OPACITY * clamp(marks.r, 0.0, 1.0));
  color = mix(color, RING_COLOR, OVERLAY_OPACITY * clamp(marks.g, 0.0, 1.0));
  color = mix(color, SHADOW_COLOR, OVERLAY_OPACITY * shadowEdgeCoverage(uv));
  let divider = dividerCoverage(position);
  color = mix(color, DIVIDER_OUTLINE, 0.75 * divider.y);
  color = mix(color, DIVIDER_COLOR, divider.x);
  return color;
}

@fragment
fn fragmentMain(input: FullscreenOutput) -> @location(0) vec4f {
  let scene = textureSampleLevel(hdr, presentSampler, imageUv(input.uv), 0.0).rgb;
  let glow = textureSampleLevel(bloomTexture, presentSampler, input.uv, 0.0).rgb;
  let encoded = displayEncode(scene + present.bloomStrength * glow, present.exposure);
  let overlaid = compositeOverlays(encoded, input.uv, input.position.xy);
  let dithered = overlaid + vec3f(present.ditherAmplitude * ditherNoise(input.position.xy) / 255.0);
  return vec4f(clamp(dithered, vec3f(0.0), vec3f(1.0)), 1.0);
}
