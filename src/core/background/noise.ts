import { hash3, unitFloat } from './hash';

export const FBM_OCTAVES = 5;
export const FBM_LACUNARITY = 2.02;
export const FBM_GAIN = 0.5;
const OCTAVE_OFFSET = [31.7, 17.3, 53.1] as const;

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function mix(low: number, high: number, amount: number): number {
  return low + (high - low) * amount;
}

function lattice(x: number, y: number, z: number, seed: number): number {
  return unitFloat(hash3(x >>> 0, y >>> 0, z >>> 0, seed));
}

export function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  const tx = fade(x - fx);
  const ty = fade(y - fy);
  const tz = fade(z - fz);
  const corner = (dx: number, dy: number, dz: number): number =>
    lattice(fx + dx, fy + dy, fz + dz, seed);
  const lowZ = mix(
    mix(corner(0, 0, 0), corner(1, 0, 0), tx),
    mix(corner(0, 1, 0), corner(1, 1, 0), tx),
    ty,
  );
  const highZ = mix(
    mix(corner(0, 0, 1), corner(1, 0, 1), tx),
    mix(corner(0, 1, 1), corner(1, 1, 1), tx),
    ty,
  );
  return mix(lowZ, highZ, tz);
}

export function fbm3(x: number, y: number, z: number, seed: number): number {
  let total = 0;
  let amplitude = 0.5;
  let norm = 0;
  let px = x;
  let py = y;
  let pz = z;
  for (let octave = 0; octave < FBM_OCTAVES; octave += 1) {
    total += amplitude * valueNoise3(px, py, pz, seed + octave);
    norm += amplitude;
    amplitude *= FBM_GAIN;
    px = px * FBM_LACUNARITY + OCTAVE_OFFSET[0];
    py = py * FBM_LACUNARITY + OCTAVE_OFFSET[1];
    pz = pz * FBM_LACUNARITY + OCTAVE_OFFSET[2];
  }
  return total / norm;
}
