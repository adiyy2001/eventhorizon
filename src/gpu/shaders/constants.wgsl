const SCHWARZSCHILD_RADIUS: f32 = 2.0;
const PHOTON_SPHERE_RADIUS: f32 = 3.0;
const PI: f32 = 3.14159265358979;
const TAU: f32 = 6.28318530717959;

const OUTCOME_CAPTURED: u32 = 0u;
const OUTCOME_ESCAPED: u32 = 1u;
const OUTCOME_DISK: u32 = 2u;

const FLAG_LENSING: u32 = 1u;
const FLAG_HIGHER_ORDER: u32 = 2u;
const FLAG_DISK: u32 = 4u;
const FLAG_GRAVITATIONAL: u32 = 8u;
const FLAG_DOPPLER: u32 = 16u;

const RESULT_STEP_LIMIT: u32 = 1u;

struct TraceParams {
  cameraPosition: vec3f,
  observerDistance: f32,
  cameraForward: vec3f,
  halfWidth: f32,
  cameraRight: vec3f,
  halfHeight: f32,
  cameraUp: vec3f,
  jitterX: f32,
  width: u32,
  height: u32,
  jitterY: f32,
  captureMargin: f32,
  diskInner: f32,
  diskOuter: f32,
  escapeRadius: f32,
  stepKappa: f32,
  stepAngularWeight: f32,
  stepMin: f32,
  stepMax: f32,
  maxSteps: u32,
  maxCrossings: u32,
  flags: u32,
  rayCount: u32,
  peakTemperature: f32,
}

struct Ray {
  position: vec3f,
  velocity: vec3f,
}

struct TraceResult {
  outcome: u32,
  steps: u32,
  crossings: u32,
  flags: u32,
  direction: vec3f,
  hitRadius: f32,
  hitLambda: f32,
  hitX: f32,
  hitZ: f32,
  hitIndex: u32,
}

fn hasFlag(params: TraceParams, flag: u32) -> bool {
  return (params.flags & flag) != 0u;
}
