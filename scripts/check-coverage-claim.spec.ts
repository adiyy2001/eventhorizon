import { describe, expect, it } from 'vitest';
import { claimProblems, coverageClaims, roundedToOneDecimal } from './check-coverage-claim.ts';

const readme = [
  '![Line coverage 98.7 percent](https://img.shields.io/badge/line%20coverage-98.7%25-brightgreen)',
  'Line coverage is 98.7 percent overall.',
].join('\n');

describe('coverage claims', () => {
  it('finds the badge, its alt text and the prose figure', () => {
    expect(coverageClaims(readme)).toEqual([98.7, 98.7, 98.7]);
  });

  it('rounds half up to one decimal', () => {
    expect(roundedToOneDecimal(98.654)).toBe(98.7);
    expect(roundedToOneDecimal(98.649)).toBe(98.6);
  });

  it('accepts a README that matches the measurement', () => {
    expect(claimProblems(readme, 98.654)).toEqual([]);
  });

  it('reports every stale figure', () => {
    expect(claimProblems(readme, 97.2)).toHaveLength(3);
  });

  it('requires a figure to be stated', () => {
    expect(claimProblems('no numbers here', 98.7)).toHaveLength(1);
  });
});
