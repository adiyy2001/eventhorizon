export const smokeElementCount = 1000;

export const smokeWorkgroupSize = 64;

export function expectedSmokeValues(count: number): Uint32Array {
  return Uint32Array.from({ length: count }, (_, index) => index * index + 7);
}

export function countMatchingValues(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
): number {
  let matching = 0;
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] === expected[index]) {
      matching += 1;
    }
  }
  return matching;
}

export function workgroupCount(elements: number, workgroupSize: number): number {
  return Math.ceil(elements / workgroupSize);
}
