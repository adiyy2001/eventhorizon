import { buildTemperatureLut } from '../color/temperature-lut';
import {
  buildColorParitySets,
  COLOR_PARITY_MODES,
  type ColorParitySet,
  compareColorOutputs,
} from './color-parity';

const lut = buildTemperatureLut();
const sets = buildColorParitySets(lut);

function setFor(mode: string): ColorParitySet {
  const found = sets.find((candidate) => candidate.mode === mode);
  if (found === undefined) {
    throw new Error(`no set for ${mode}`);
  }
  return found;
}

describe('colour parity sets', () => {
  it('covers every mode exactly once', () => {
    expect(sets.map((set) => set.mode)).toEqual([...COLOR_PARITY_MODES]);
  });

  it('pairs every input sample with an expected sample', () => {
    for (const set of sets) {
      expect(set.inputs.length, set.mode).toBe(set.expected.length);
      expect(set.inputs.length % 4).toBe(0);
      expect(set.inputs.length, set.mode).toBeGreaterThanOrEqual(240);
    }
  });

  it('is deterministic', () => {
    expect(buildColorParitySets(lut)).toEqual(sets);
  });

  it('keeps the star probes inside the lit part of the sky', () => {
    const set = setFor('stars');
    const lit = set.expected.filter((value, index) => index % 4 < 3 && value > 0).length;
    expect(lit).toBeGreaterThan(set.expected.length / 4);
  });

  it('marks only the hash set as raw integer input', () => {
    expect(sets.filter((set) => set.inputsAreUint32).map((set) => set.mode)).toEqual(['hash']);
  });
});

describe('compareColorOutputs', () => {
  const set = setFor('tonemap');

  it('passes an exact copy', () => {
    const report = compareColorOutputs(set, set.expected);
    expect(report.pass).toBe(true);
    expect(report.violations).toBe(0);
    expect(report.maxAbsoluteError).toBe(0);
  });

  it('flags a value outside the tolerance and reports the largest error', () => {
    const actual = [...set.expected];
    actual[1] = (actual[1] ?? 0) + 0.01;
    const report = compareColorOutputs(set, actual);
    expect(report.pass).toBe(false);
    expect(report.violations).toBe(1);
    expect(report.maxAbsoluteError).toBeCloseTo(0.01, 12);
  });

  it('treats NaN as a violation', () => {
    const actual = [...set.expected];
    actual[0] = Number.NaN;
    const report = compareColorOutputs(set, actual);
    expect(report.violations).toBe(1);
    expect(report.maxAbsoluteError).toBe(Number.POSITIVE_INFINITY);
  });

  it('fails when the sample count differs', () => {
    expect(compareColorOutputs(set, set.expected.slice(4)).pass).toBe(false);
  });
});
