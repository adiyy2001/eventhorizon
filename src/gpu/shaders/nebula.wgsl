const NEBULA_BAND_WIDTH: f32 = 0.22;
const NEBULA_CLOUD_GAIN: f32 = 0.15;
const NEBULA_GLOW_GAIN: f32 = 0.03;
const NEBULA_WARM_TINT: vec3f = vec3f(1.0, 0.38, 0.3);
const NEBULA_COOL_TINT: vec3f = vec3f(0.3, 0.5, 1.0);
const NEBULA_GLOW_TINT: vec3f = vec3f(1.0, 0.92, 0.8);

fn nebulaRadiance(direction: vec3f) -> vec3f {
  let bandNormal = normalize(vec3f(0.3, 0.9, 0.3));
  let offset = dot(direction, bandNormal);
  let band = exp(-(offset * offset) / (2.0 * NEBULA_BAND_WIDTH * NEBULA_BAND_WIDTH));
  let warp = fbm3(direction * 1.7, 11u);
  let cloud = fbm3(direction * 3.1 + vec3f(warp * 1.3), 23u);
  let density = smoothstep(0.42, 0.78, cloud);
  let hue = smoothstep(0.35, 0.65, fbm3(direction * 1.3 + vec3f(5.0), 37u));
  let dust = fbm3(direction * 9.0, 41u);
  let cloudScale = density * (0.25 + 0.75 * band) * NEBULA_CLOUD_GAIN;
  let glowScale = band * NEBULA_GLOW_GAIN * (0.5 + dust);
  let tint = mix(NEBULA_WARM_TINT, NEBULA_COOL_TINT, hue);
  return tint * cloudScale + NEBULA_GLOW_TINT * glowScale;
}
