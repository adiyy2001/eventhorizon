export const OUTCOME_CODES = { captured: 0, escaped: 1, disk: 2 } as const;

export type OutcomeName = keyof typeof OUTCOME_CODES;

export interface RayRecord {
  outcome: number;
  steps: number;
  crossings: number;
  stepLimitReached: boolean;
  direction: readonly [number, number, number];
  hitRadius: number;
  hitLambda: number;
  hitIndex: number;
}

export interface ParityTolerances {
  directionRadians: number;
  hitRadiusRelative: number;
  hitLambdaAbsolute: number;
}

export const defaultParityTolerances: ParityTolerances = {
  directionRadians: 1e-3,
  hitRadiusRelative: 1e-3,
  hitLambdaAbsolute: 1e-3,
};

export interface ParityMismatch {
  index: number;
  reference: number;
  candidate: number;
}

export interface ErrorSummary {
  count: number;
  max: number;
  mean: number;
  p99: number;
}

export interface ParityReport {
  total: number;
  outcomeMatches: number;
  outcomeMismatches: ParityMismatch[];
  referenceOutcomeCounts: Record<OutcomeName, number>;
  directionError: ErrorSummary;
  hitRadiusRelativeError: ErrorSummary;
  hitLambdaError: ErrorSummary;
  directionViolations: number[];
  hitRadiusViolations: number[];
  hitLambdaViolations: number[];
  stepLimitRays: number;
  meanSteps: { reference: number; candidate: number };
  tolerances: ParityTolerances;
  pass: boolean;
}

export function directionError(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  const crossX = left[1] * right[2] - left[2] * right[1];
  const crossY = left[2] * right[0] - left[0] * right[2];
  const crossZ = left[0] * right[1] - left[1] * right[0];
  const dotProduct = left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  return Math.atan2(Math.hypot(crossX, crossY, crossZ), dotProduct);
}

export function summarizeErrors(values: readonly number[]): ErrorSummary {
  if (values.length === 0) {
    return { count: 0, max: 0, mean: 0, p99: 0 };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const p99Index = Math.min(sorted.length - 1, Math.ceil(0.99 * sorted.length) - 1);
  return {
    count: sorted.length,
    max: sorted[sorted.length - 1] ?? 0,
    mean: total / sorted.length,
    p99: sorted[p99Index] ?? 0,
  };
}

function countOutcomes(records: readonly RayRecord[]): Record<OutcomeName, number> {
  const counts: Record<OutcomeName, number> = { captured: 0, escaped: 0, disk: 0 };
  for (const record of records) {
    if (record.outcome === OUTCOME_CODES.captured) {
      counts.captured += 1;
    } else if (record.outcome === OUTCOME_CODES.escaped) {
      counts.escaped += 1;
    } else {
      counts.disk += 1;
    }
  }
  return counts;
}

function meanOf(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function compareRecords(
  reference: readonly RayRecord[],
  candidate: readonly RayRecord[],
  tolerances: ParityTolerances = defaultParityTolerances,
  skip: ReadonlySet<number> = new Set<number>(),
): ParityReport {
  if (reference.length !== candidate.length) {
    throw new RangeError('reference and candidate must have the same length');
  }
  const outcomeMismatches: ParityMismatch[] = [];
  const directionErrors: number[] = [];
  const radiusErrors: number[] = [];
  const lambdaErrors: number[] = [];
  const directionViolations: number[] = [];
  const hitRadiusViolations: number[] = [];
  const hitLambdaViolations: number[] = [];
  let compared = 0;

  reference.forEach((expected, index) => {
    const actual = candidate[index];
    if (actual === undefined || skip.has(index)) {
      return;
    }
    compared += 1;
    if (expected.outcome !== actual.outcome) {
      outcomeMismatches.push({ index, reference: expected.outcome, candidate: actual.outcome });
      return;
    }
    if (expected.outcome === OUTCOME_CODES.escaped) {
      const error = directionError(expected.direction, actual.direction);
      directionErrors.push(error);
      if (!(error <= tolerances.directionRadians)) {
        directionViolations.push(index);
      }
    }
    if (expected.outcome === OUTCOME_CODES.disk) {
      const radiusError = Math.abs(actual.hitRadius - expected.hitRadius) / expected.hitRadius;
      const lambdaError = Math.abs(actual.hitLambda - expected.hitLambda);
      radiusErrors.push(radiusError);
      lambdaErrors.push(lambdaError);
      if (!(radiusError <= tolerances.hitRadiusRelative)) {
        hitRadiusViolations.push(index);
      }
      if (!(lambdaError <= tolerances.hitLambdaAbsolute)) {
        hitLambdaViolations.push(index);
      }
    }
  });

  const kept = reference.filter((_, index) => !skip.has(index));
  const keptCandidate = candidate.filter((_, index) => !skip.has(index));
  return {
    total: compared,
    outcomeMatches: compared - outcomeMismatches.length,
    outcomeMismatches,
    referenceOutcomeCounts: countOutcomes(kept),
    directionError: summarizeErrors(directionErrors),
    hitRadiusRelativeError: summarizeErrors(radiusErrors),
    hitLambdaError: summarizeErrors(lambdaErrors),
    directionViolations,
    hitRadiusViolations,
    hitLambdaViolations,
    stepLimitRays: keptCandidate.filter((record) => record.stepLimitReached).length,
    meanSteps: {
      reference: meanOf(kept.map((record) => record.steps)),
      candidate: meanOf(keptCandidate.map((record) => record.steps)),
    },
    tolerances,
    pass:
      outcomeMismatches.length === 0 &&
      directionViolations.length === 0 &&
      hitRadiusViolations.length === 0 &&
      hitLambdaViolations.length === 0,
  };
}
