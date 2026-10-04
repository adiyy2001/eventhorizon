import { CRITICAL_IMPACT_PARAMETER, SCHWARZSCHILD_RADIUS } from './constants';
import {
  angleForImpactParameter,
  cameraBasis,
  directionAtAngle,
  staticObserverRay,
} from './observer';
import { defaultTraceOptions, traceRay, type TraceOptions } from './trace';

export interface CriticalImpactSearch {
  distance: number;
  tolerance: number;
  lower: number;
  upper: number;
  traceOptions: TraceOptions | null;
}

export interface CriticalImpactResult {
  impactParameter: number;
  iterations: number;
}

export function shadowAngularRadius(distance: number): number {
  return Math.asin(
    (CRITICAL_IMPACT_PARAMETER / distance) * Math.sqrt(1 - SCHWARZSCHILD_RADIUS / distance),
  );
}

export function defaultCriticalImpactSearch(distance: number): CriticalImpactSearch {
  return { distance, tolerance: 1e-9, lower: 4, upper: 7, traceOptions: null };
}

export function findCriticalImpactParameter(search: CriticalImpactSearch): CriticalImpactResult {
  const basis = cameraBasis({
    distance: search.distance,
    inclination: Math.PI / 2,
    azimuth: 0,
    verticalFieldOfView: 1,
  });
  const options = search.traceOptions ?? defaultTraceOptions(search.distance, null);
  const isCaptured = (impactParameter: number): boolean => {
    const angle = angleForImpactParameter(search.distance, impactParameter);
    const ray = staticObserverRay(basis.position, directionAtAngle(basis, angle));
    return traceRay(ray, options).outcome === 'captured';
  };
  let low = search.lower;
  let high = search.upper;
  let iterations = 0;
  while (high - low > search.tolerance) {
    const middle = 0.5 * (low + high);
    if (isCaptured(middle)) {
      low = middle;
    } else {
      high = middle;
    }
    iterations += 1;
  }
  return { impactParameter: 0.5 * (low + high), iterations };
}
