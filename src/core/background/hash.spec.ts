import { hash3, pcgHash, unitFloat } from './hash';

function referencePcg(value: bigint): bigint {
  const mask = 0xffffffffn;
  const state = (value * 747796405n + 2891336197n) & mask;
  const shift = (state >> 28n) + 4n;
  const word = (((state >> shift) ^ state) * 277803737n) & mask;
  return ((word >> 22n) ^ word) & mask;
}

describe('integer hash', () => {
  it('matches an independent BigInt implementation of PCG', () => {
    for (const value of [0, 1, 2, 12345, 0x7fffffff, 0x80000000, 0xffffffff, 3735928559]) {
      expect(pcgHash(value)).toBe(Number(referencePcg(BigInt(value))));
    }
  });

  it('stays an unsigned 32 bit integer', () => {
    for (let value = 0; value < 1000; value += 1) {
      const hash = pcgHash(value);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(2 ** 32);
    }
  });

  it('combines three coordinates in an order dependent way', () => {
    expect(hash3(1, 2, 3, 0)).not.toBe(hash3(3, 2, 1, 0));
    expect(hash3(1, 2, 3, 0)).not.toBe(hash3(1, 2, 3, 1));
    expect(hash3(1, 2, 3, 7)).toBe(hash3(1, 2, 3, 7));
  });

  it('maps negative lattice coordinates through the unsigned wrap', () => {
    expect(hash3(-1 >>> 0, 0, 0, 0)).toBe(hash3(4294967295, 0, 0, 0));
  });
});

describe('unit float from a hash', () => {
  it('lies in [0, 1) and is exactly representable in single precision', () => {
    expect(unitFloat(0)).toBe(0);
    expect(unitFloat(0xffffffff)).toBeLessThan(1);
    expect(Math.fround(unitFloat(0xdeadbeef))).toBe(unitFloat(0xdeadbeef));
  });

  it('has mean 0.5 and variance 1/12 over many hashes', () => {
    const count = 100000;
    let sum = 0;
    let squares = 0;
    for (let index = 0; index < count; index += 1) {
      const value = unitFloat(pcgHash(index));
      sum += value;
      squares += value * value;
    }
    const mean = sum / count;
    expect(mean).toBeCloseTo(0.5, 2);
    expect(squares / count - mean * mean).toBeCloseTo(1 / 12, 2);
  });
});
