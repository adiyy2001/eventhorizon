const OVERLAY_HALF_PIXELS: f32 = 0.9;
const OVERLAY_MIN_ACROSS: f32 = 0.2;
const OVERLAY_DOT_PERIOD_PIXELS: f32 = 7.0;
const OVERLAY_DOT_DUTY: f32 = 0.45;
const OVERLAY_DASH_PERIOD_PIXELS: f32 = 30.0;
const OVERLAY_DASH_DUTY: f32 = 0.65;
const OVERLAY_MIN_SEGMENTS: f32 = 6.0;

var<private> overlayHits: u32;

fn overlayEnabled(params: TraceParams, bit: u32) -> bool {
  return (params.overlayFlags & bit) != 0u;
}

fn overlayPixelWorld(params: TraceParams) -> f32 {
  return 2.0 * params.halfHeight / f32(params.height) * params.observerDistance;
}

fn overlayHalfWidth(params: TraceParams, axis: vec3f, direction: vec3f) -> f32 {
  let alongRay = dot(axis, direction);
  let across = max(sqrt(max(1.0 - alongRay * alongRay, 0.0)), OVERLAY_MIN_ACROSS);
  return OVERLAY_HALF_PIXELS * overlayPixelWorld(params) / across;
}

fn overlaySegments(circumference: f32, periodPixels: f32, params: TraceParams) -> f32 {
  return max(OVERLAY_MIN_SEGMENTS, round(circumference / (periodPixels * overlayPixelWorld(params))));
}

fn patternOn(angle: f32, segments: f32, duty: f32) -> bool {
  return fract(angle / TAU * segments) < duty;
}

fn greatCircleHit(point: vec3f, axis: vec3f, direction: vec3f, angle: f32, segments: f32, params: TraceParams) -> bool {
  let band = overlayHalfWidth(params, axis, direction) / PHOTON_SPHERE_RADIUS;
  return abs(dot(point, axis)) < band && patternOn(angle, segments, OVERLAY_DOT_DUTY);
}

fn markPhotonSphere(previous: Ray, current: Ray, params: TraceParams) {
  let before = length(previous.position);
  let after = length(current.position);
  if (before <= PHOTON_SPHERE_RADIUS || after > PHOTON_SPHERE_RADIUS) {
    return;
  }
  let fraction = (before - PHOTON_SPHERE_RADIUS) / (before - after);
  let point = normalize(mix(previous.position, current.position, fraction));
  let direction = normalize(current.velocity);
  let segments = overlaySegments(TAU * PHOTON_SPHERE_RADIUS, OVERLAY_DOT_PERIOD_PIXELS, params);
  let equator = greatCircleHit(point, vec3f(0.0, 1.0, 0.0), direction, atan2(point.z, point.x), segments, params);
  let meridianX = greatCircleHit(point, vec3f(1.0, 0.0, 0.0), direction, atan2(point.y, point.z), segments, params);
  let meridianZ = greatCircleHit(point, vec3f(0.0, 0.0, 1.0), direction, atan2(point.y, point.x), segments, params);
  if (equator || meridianX || meridianZ) {
    overlayHits = overlayHits | OVERLAY_PHOTON_SPHERE;
  }
}

fn markIsco(crossing: PlaneCrossing, velocity: vec3f, params: TraceParams) {
  let radial = vec3f(crossing.x, 0.0, crossing.z) / max(crossing.radius, 1e-6);
  let halfWidth = overlayHalfWidth(params, radial, normalize(velocity));
  if (abs(crossing.radius - params.diskInner) >= halfWidth) {
    return;
  }
  let segments = overlaySegments(TAU * params.diskInner, OVERLAY_DASH_PERIOD_PIXELS, params);
  if (patternOn(atan2(crossing.z, crossing.x), segments, OVERLAY_DASH_DUTY)) {
    overlayHits = overlayHits | OVERLAY_ISCO;
  }
}
