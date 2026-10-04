import { type TemperatureLut, sampleLut } from '../color/temperature-lut';
import { type Rgb } from '../color/xyz-srgb';
import { type Vec3, dot } from '../physics/vec3';
import { FACE_COUNT, cubeFace, faceDirection } from './cube-faces';
import { hash3, unitFloat } from './hash';

export const STAR_CELLS_PER_EDGE = 64;
export const STAR_PEAK_DENSITY = 0.45;
export const STAR_SIGMA = 7e-4;
export const STAR_PEAK_MIN = 0.02;
export const STAR_PEAK_MAX = 3;
export const STAR_FLUX_EXPONENT = -0.8;
export const STAR_TEMPERATURE_MIN = 2600;
export const STAR_TEMPERATURE_RATIO = 6.92;
export const STAR_FACE_MARGIN = 0.02;
export const STAR_SEED = 0x51a7;
const SEED_EXISTENCE = 0;
const SEED_U = 1;
const SEED_V = 2;
const SEED_FLUX = 3;
const SEED_TEMPERATURE = 4;

export interface Star {
  direction: Vec3;
  peak: number;
  temperature: number;
}

function cellHash(face: number, column: number, row: number, channel: number): number {
  return unitFloat(hash3(column, row, face * 8 + channel, STAR_SEED));
}

export function starInCell(face: number, column: number, row: number): Star | null {
  const cellU = (column + cellHash(face, column, row, SEED_U)) / STAR_CELLS_PER_EDGE;
  const cellV = (row + cellHash(face, column, row, SEED_V)) / STAR_CELLS_PER_EDGE;
  const u = 2 * cellU - 1;
  const v = 2 * cellV - 1;
  const solidAngleWeight = Math.pow(1 + u * u + v * v, -1.5);
  if (cellHash(face, column, row, SEED_EXISTENCE) >= STAR_PEAK_DENSITY * solidAngleWeight) {
    return null;
  }
  const flux = cellHash(face, column, row, SEED_FLUX);
  const peak = Math.min(STAR_PEAK_MIN * Math.pow(1 - flux, STAR_FLUX_EXPONENT), STAR_PEAK_MAX);
  const temperature =
    STAR_TEMPERATURE_MIN *
    Math.pow(STAR_TEMPERATURE_RATIO, cellHash(face, column, row, SEED_TEMPERATURE));
  return { direction: faceDirection(face, u, v), peak, temperature };
}

export function allStars(): Star[] {
  const stars: Star[] = [];
  for (let face = 0; face < FACE_COUNT; face += 1) {
    for (let row = 0; row < STAR_CELLS_PER_EDGE; row += 1) {
      for (let column = 0; column < STAR_CELLS_PER_EDGE; column += 1) {
        const star = starInCell(face, column, row);
        if (star !== null) {
          stars.push(star);
        }
      }
    }
  }
  return stars;
}

export function starWeight(direction: Vec3, star: Star): number {
  const dx = direction.x - star.direction.x;
  const dy = direction.y - star.direction.y;
  const dz = direction.z - star.direction.z;
  return Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * STAR_SIGMA * STAR_SIGMA));
}

export function starRadiance(direction: Vec3, lut: TemperatureLut): Rgb {
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let faceIndex = 0; faceIndex < FACE_COUNT; faceIndex += 1) {
    const face = cubeFace(faceIndex);
    const depth = dot(direction, face.forward);
    if (depth <= 0.5) {
      continue;
    }
    const u = dot(direction, face.uAxis) / depth;
    const v = dot(direction, face.vAxis) / depth;
    const limit = 1 + STAR_FACE_MARGIN;
    if (Math.abs(u) > limit || Math.abs(v) > limit) {
      continue;
    }
    const centerColumn = Math.floor(((u + 1) / 2) * STAR_CELLS_PER_EDGE);
    const centerRow = Math.floor(((v + 1) / 2) * STAR_CELLS_PER_EDGE);
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        const column = centerColumn + columnOffset;
        const row = centerRow + rowOffset;
        if (column < 0 || column >= STAR_CELLS_PER_EDGE || row < 0 || row >= STAR_CELLS_PER_EDGE) {
          continue;
        }
        const star = starInCell(faceIndex, column, row);
        if (star === null) {
          continue;
        }
        const weight = starWeight(direction, star) * star.peak;
        if (weight === 0) {
          continue;
        }
        const color = sampleLut(lut, star.temperature);
        red += color[0] * weight;
        green += color[1] * weight;
        blue += color[2] * weight;
      }
    }
  }
  return [red, green, blue];
}
