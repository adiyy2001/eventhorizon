import { type Float32TraceResult } from '../physics/trace-float32';
import { type TraceResult } from '../physics/trace';
import { OUTCOME_CODES, type RayRecord } from './parity';

export function recordFromTrace(result: TraceResult): RayRecord {
  const hit = result.diskHit;
  return {
    outcome: OUTCOME_CODES[result.outcome],
    steps: result.steps,
    crossings: result.crossings.length,
    stepLimitReached: result.stepLimitReached,
    direction: [result.finalDirection.x, result.finalDirection.y, result.finalDirection.z],
    hitRadius: hit?.radius ?? 0,
    hitLambda: hit?.lambda ?? 0,
    hitIndex: hit?.index ?? 0,
  };
}

export function recordFromFloat32(result: Float32TraceResult): RayRecord {
  const hit = result.diskHit;
  return {
    outcome: OUTCOME_CODES[result.outcome],
    steps: result.steps,
    crossings: result.crossings,
    stepLimitReached: result.stepLimitReached,
    direction: [result.direction.x, result.direction.y, result.direction.z],
    hitRadius: hit?.radius ?? 0,
    hitLambda: hit?.lambda ?? 0,
    hitIndex: hit?.index ?? 0,
  };
}
