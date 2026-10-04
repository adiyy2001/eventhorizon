const FBM_OCTAVES: u32 = 5u;
const FBM_LACUNARITY: f32 = 2.02;
const FBM_GAIN: f32 = 0.5;
const FBM_OFFSET: vec3f = vec3f(31.7, 17.3, 53.1);

fn fade(t: f32) -> f32 {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn latticeValue(cell: vec3i, seed: u32) -> f32 {
  return unitFloat(hash3(bitcast<u32>(cell.x), bitcast<u32>(cell.y), bitcast<u32>(cell.z), seed));
}

fn valueNoise3(point: vec3f, seed: u32) -> f32 {
  let base = floor(point);
  let cell = vec3i(base);
  let t = vec3f(fade(point.x - base.x), fade(point.y - base.y), fade(point.z - base.z));
  let lowZ = mix(
    mix(latticeValue(cell, seed), latticeValue(cell + vec3i(1, 0, 0), seed), t.x),
    mix(latticeValue(cell + vec3i(0, 1, 0), seed), latticeValue(cell + vec3i(1, 1, 0), seed), t.x),
    t.y,
  );
  let highZ = mix(
    mix(latticeValue(cell + vec3i(0, 0, 1), seed), latticeValue(cell + vec3i(1, 0, 1), seed), t.x),
    mix(latticeValue(cell + vec3i(0, 1, 1), seed), latticeValue(cell + vec3i(1, 1, 1), seed), t.x),
    t.y,
  );
  return mix(lowZ, highZ, t.z);
}

fn fbm3(point: vec3f, seed: u32) -> f32 {
  var total = 0.0;
  var amplitude = 0.5;
  var norm = 0.0;
  var shifted = point;
  for (var octave = 0u; octave < FBM_OCTAVES; octave = octave + 1u) {
    total = total + amplitude * valueNoise3(shifted, seed + octave);
    norm = norm + amplitude;
    amplitude = amplitude * FBM_GAIN;
    shifted = shifted * FBM_LACUNARITY + FBM_OFFSET;
  }
  return total / norm;
}
