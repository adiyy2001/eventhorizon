export const UNIT_FLOAT_STEPS = 16777216;

export function pcgHash(value: number): number {
  const state = (Math.imul(value, 747796405) + 2891336197) >>> 0;
  const word = Math.imul((state >>> ((state >>> 28) + 4)) ^ state, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}

export function hash3(x: number, y: number, z: number, seed: number): number {
  const inner = pcgHash((z + seed) >>> 0);
  const middle = pcgHash((y + inner) >>> 0);
  return pcgHash((x + middle) >>> 0);
}

export function unitFloat(hash: number): number {
  return (hash >>> 8) / UNIT_FLOAT_STEPS;
}
