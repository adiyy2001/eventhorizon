import {
  compareRecords,
  directionError,
  OUTCOME_CODES,
  summarizeErrors,
  type RayRecord,
} from './parity';

function record(overrides: Partial<RayRecord> = {}): RayRecord {
  return {
    outcome: OUTCOME_CODES.escaped,
    steps: 100,
    crossings: 0,
    stepLimitReached: false,
    direction: [1, 0, 0],
    hitRadius: 0,
    hitLambda: 0,
    hitIndex: 0,
    ...overrides,
  };
}

describe('directionError', () => {
  it('is the angle between two unit vectors', () => {
    expect(directionError([1, 0, 0], [0, 1, 0])).toBeCloseTo(Math.PI / 2, 12);
    expect(directionError([1, 0, 0], [1, 0, 0])).toBe(0);
    expect(directionError([1, 0, 0], [Math.cos(1e-6), Math.sin(1e-6), 0])).toBeCloseTo(1e-6, 12);
  });
});

describe('summarizeErrors', () => {
  it('returns zeros for an empty list', () => {
    expect(summarizeErrors([])).toEqual({ count: 0, max: 0, mean: 0, p99: 0 });
  });

  it('reports the maximum, the mean and the 99th percentile', () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    const summary = summarizeErrors(values);
    expect(summary.count).toBe(100);
    expect(summary.max).toBe(100);
    expect(summary.mean).toBe(50.5);
    expect(summary.p99).toBe(99);
  });
});

describe('compareRecords', () => {
  it('passes identical records', () => {
    const records = [
      record(),
      record({ outcome: OUTCOME_CODES.captured }),
      record({ outcome: OUTCOME_CODES.disk, hitRadius: 8, hitLambda: 1, hitIndex: 1 }),
    ];
    const report = compareRecords(records, records);
    expect(report.pass).toBe(true);
    expect(report.total).toBe(3);
    expect(report.outcomeMatches).toBe(3);
    expect(report.referenceOutcomeCounts).toEqual({ captured: 1, escaped: 1, disk: 1 });
    expect(report.meanSteps).toEqual({ reference: 100, candidate: 100 });
  });

  it('lists outcome mismatches with their index', () => {
    const report = compareRecords(
      [record(), record()],
      [record(), record({ outcome: OUTCOME_CODES.captured })],
    );
    expect(report.pass).toBe(false);
    expect(report.outcomeMismatches).toEqual([
      { index: 1, reference: OUTCOME_CODES.escaped, candidate: OUTCOME_CODES.captured },
    ]);
  });

  it('flags a final direction beyond the tolerance', () => {
    const tilted = record({ direction: [Math.cos(2e-3), Math.sin(2e-3), 0] });
    const report = compareRecords([record()], [tilted]);
    expect(report.directionViolations).toEqual([0]);
    expect(report.pass).toBe(false);
  });

  it('flags the hit radius and the angular momentum of disk hits', () => {
    const hit = record({ outcome: OUTCOME_CODES.disk, hitRadius: 10, hitLambda: 2, hitIndex: 1 });
    const report = compareRecords(
      [hit, hit],
      [
        { ...hit, hitRadius: 10.02 },
        { ...hit, hitLambda: 2.01 },
      ],
    );
    expect(report.hitRadiusViolations).toEqual([0]);
    expect(report.hitLambdaViolations).toEqual([1]);
  });

  it('ignores the direction of captured rays and skipped indices', () => {
    const captured = record({ outcome: OUTCOME_CODES.captured, direction: [0, 0, 1] });
    const report = compareRecords(
      [captured, record()],
      [{ ...captured, direction: [0, 1, 0] }, record({ outcome: OUTCOME_CODES.captured })],
      undefined,
      new Set([1]),
    );
    expect(report.pass).toBe(true);
    expect(report.total).toBe(1);
  });

  it('counts rays that hit the step limit', () => {
    const report = compareRecords([record()], [record({ stepLimitReached: true })]);
    expect(report.stepLimitRays).toBe(1);
  });

  it('refuses lists of different length', () => {
    expect(() => compareRecords([record()], [])).toThrow(RangeError);
  });
});
