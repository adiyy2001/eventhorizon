const STAR_CELLS_PER_EDGE: i32 = 96;
const STAR_PEAK_DENSITY: f32 = 0.5;
const STAR_SIGMA: f32 = 0.0007;
const STAR_PEAK_MIN: f32 = 0.06;
const STAR_PEAK_MAX: f32 = 6.0;
const STAR_FLUX_EXPONENT: f32 = -0.8;
const STAR_TEMPERATURE_MIN: f32 = 2600.0;
const STAR_TEMPERATURE_RATIO: f32 = 6.92;
const STAR_FACE_MARGIN: f32 = 0.02;
const STAR_SEED: u32 = 20903u;

struct Star {
  direction: vec3f,
  peak: f32,
  temperature: f32,
  present: bool,
}

fn starCellHash(face: u32, column: i32, row: i32, channel: u32) -> f32 {
  return unitFloat(hash3(u32(column), u32(row), face * 8u + channel, STAR_SEED));
}

fn starInCell(face: u32, column: i32, row: i32) -> Star {
  var star: Star;
  star.present = false;
  let cells = f32(STAR_CELLS_PER_EDGE);
  let u = 2.0 * (f32(column) + starCellHash(face, column, row, 1u)) / cells - 1.0;
  let v = 2.0 * (f32(row) + starCellHash(face, column, row, 2u)) / cells - 1.0;
  let solidAngleWeight = pow(1.0 + u * u + v * v, -1.5);
  if (starCellHash(face, column, row, 0u) >= STAR_PEAK_DENSITY * solidAngleWeight) {
    return star;
  }
  let flux = starCellHash(face, column, row, 3u);
  star.peak = min(STAR_PEAK_MIN * pow(1.0 - flux, STAR_FLUX_EXPONENT), STAR_PEAK_MAX);
  star.temperature = STAR_TEMPERATURE_MIN * pow(STAR_TEMPERATURE_RATIO, starCellHash(face, column, row, 4u));
  star.direction = faceDirection(face, u, v);
  star.present = true;
  return star;
}

fn starWeight(direction: vec3f, star: Star) -> f32 {
  let difference = direction - star.direction;
  return exp(-dot(difference, difference) / (2.0 * STAR_SIGMA * STAR_SIGMA));
}

fn starRadiance(direction: vec3f) -> vec3f {
  var total = vec3f(0.0);
  let limit = 1.0 + STAR_FACE_MARGIN;
  for (var face = 0u; face < FACE_COUNT; face = face + 1u) {
    let depth = dot(direction, faceForward(face));
    if (depth <= 0.5) {
      continue;
    }
    let u = dot(direction, faceU(face)) / depth;
    let v = dot(direction, faceV(face)) / depth;
    if (abs(u) > limit || abs(v) > limit) {
      continue;
    }
    let centerColumn = i32(floor((u + 1.0) * 0.5 * f32(STAR_CELLS_PER_EDGE)));
    let centerRow = i32(floor((v + 1.0) * 0.5 * f32(STAR_CELLS_PER_EDGE)));
    for (var rowOffset = -1; rowOffset <= 1; rowOffset = rowOffset + 1) {
      for (var columnOffset = -1; columnOffset <= 1; columnOffset = columnOffset + 1) {
        let column = centerColumn + columnOffset;
        let row = centerRow + rowOffset;
        if (column < 0 || column >= STAR_CELLS_PER_EDGE || row < 0 || row >= STAR_CELLS_PER_EDGE) {
          continue;
        }
        let star = starInCell(face, column, row);
        if (!star.present) {
          continue;
        }
        let weight = starWeight(direction, star) * star.peak;
        total = total + lutColor(star.temperature) * weight;
      }
    }
  }
  return total;
}
