fn pcgHash(value: u32) -> u32 {
  let state = value * 747796405u + 2891336197u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn hash3(x: u32, y: u32, z: u32, seed: u32) -> u32 {
  return pcgHash(x + pcgHash(y + pcgHash(z + seed)));
}

fn unitFloat(hash: u32) -> f32 {
  return f32(hash >> 8u) * (1.0 / 16777216.0);
}
