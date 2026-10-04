import { CRITICAL_IMPACT_PARAMETER, ISCO_RADIUS } from '../physics/constants';
import { type DiskGeometry } from '../physics/disk';
import { impactParameter } from '../physics/geodesic';
import { angleForImpactParameter, cameraBasis, staticObserverRay } from '../physics/observer';
import { traceRay, type TraceOptions } from '../physics/trace';
import { defaultView, viewTraceOptions, type ViewDescription } from '../render/view';
import { add, scale, type Vec3, vec3 } from '../physics/vec3';
import { createMulberry32, uniformBetween } from './prng';

export interface ParityRay {
  position: readonly [number, number, number];
  direction: readonly [number, number, number];
  distance: number;
  impactParameter: number;
}

export interface ParityRaySetSpec {
  count: number;
  seed: number;
  distances: readonly number[];
  inclinationsDegrees: readonly number[];
  diskOuterRadius: number;
  criticalMargin: number;
  diskEdgeMargin: number;
  lowestImpactFactor: number;
  highestImpactParameter: number;
}

export const defaultParitySpec: ParityRaySetSpec = {
  count: 4096,
  seed: 20261004,
  distances: [10, 30, 60],
  inclinationsDegrees: [5, 30, 60, 80, 88],
  diskOuterRadius: 20,
  criticalMargin: 0.02,
  diskEdgeMargin: 2e-3,
  lowestImpactFactor: 0.5,
  highestImpactParameter: 40,
};

export function paritySetDisk(spec: ParityRaySetSpec): DiskGeometry {
  return { innerRadius: ISCO_RADIUS, outerRadius: spec.diskOuterRadius };
}

export function parityView(spec: ParityRaySetSpec): ViewDescription {
  return {
    ...defaultView,
    distance: Math.max(...spec.distances),
    diskOuterRadius: spec.diskOuterRadius,
  };
}

export function parityTraceOptions(spec: ParityRaySetSpec): TraceOptions {
  return viewTraceOptions(parityView(spec));
}

function roundVector(vector: Vec3): readonly [number, number, number] {
  return [Math.fround(vector.x), Math.fround(vector.y), Math.fround(vector.z)];
}

function sampleImpactParameter(random: () => number, index: number, spec: ParityRaySetSpec) {
  const lowest = spec.lowestImpactFactor * CRITICAL_IMPACT_PARAMETER;
  const band = index % 10;
  if (band < 3) {
    return uniformBetween(random, lowest, CRITICAL_IMPACT_PARAMETER - spec.criticalMargin);
  }
  if (band < 7) {
    return uniformBetween(
      random,
      CRITICAL_IMPACT_PARAMETER + spec.criticalMargin,
      2.2 * CRITICAL_IMPACT_PARAMETER,
    );
  }
  const logLow = Math.log(2.2 * CRITICAL_IMPACT_PARAMETER);
  const logHigh = Math.log(spec.highestImpactParameter);
  return Math.exp(uniformBetween(random, logLow, logHigh));
}

function candidateRay(random: () => number, index: number, spec: ParityRaySetSpec): ParityRay {
  const distance = spec.distances[index % spec.distances.length] ?? 30;
  const inclinationDegrees =
    spec.inclinationsDegrees[Math.floor(random() * spec.inclinationsDegrees.length)] ?? 80;
  const basis = cameraBasis({
    distance,
    inclination: (inclinationDegrees * Math.PI) / 180,
    azimuth: uniformBetween(random, 0, 2 * Math.PI),
    verticalFieldOfView: 1,
  });
  const target = sampleImpactParameter(random, index, spec);
  const angle = angleForImpactParameter(distance, Math.min(target, distance * 0.999));
  const roll = uniformBetween(random, 0, 2 * Math.PI);
  const sideways = add(scale(basis.up, Math.cos(roll)), scale(basis.right, Math.sin(roll)));
  const direction = add(scale(basis.forward, Math.cos(angle)), scale(sideways, Math.sin(angle)));
  const position = roundVector(basis.position);
  const roundedDirection = roundVector(direction);
  const start = staticObserverRay(vec3(...position), vec3(...roundedDirection));
  return {
    position,
    direction: roundedDirection,
    distance,
    impactParameter: impactParameter(start),
  };
}

export function isAmbiguousReference(
  ray: ParityRay,
  spec: ParityRaySetSpec,
  crossingRadii: readonly number[],
  stepLimitReached: boolean,
): boolean {
  if (stepLimitReached) {
    return true;
  }
  if (Math.abs(ray.impactParameter - CRITICAL_IMPACT_PARAMETER) < spec.criticalMargin) {
    return true;
  }
  const disk = paritySetDisk(spec);
  return crossingRadii.some(
    (radius) =>
      Math.abs(radius - disk.innerRadius) < spec.diskEdgeMargin ||
      Math.abs(radius - disk.outerRadius) < spec.diskEdgeMargin,
  );
}

export function generateParityRays(spec: ParityRaySetSpec = defaultParitySpec): ParityRay[] {
  const random = createMulberry32(spec.seed);
  const rays: ParityRay[] = [];
  let attempt = 0;
  while (rays.length < spec.count) {
    const ray = candidateRay(random, attempt, spec);
    attempt += 1;
    const start = staticObserverRay(vec3(...ray.position), vec3(...ray.direction));
    const result = traceRay(start, parityTraceOptions(spec));
    const radii = result.crossings.map((crossing) => crossing.radius);
    if (!isAmbiguousReference(ray, spec, radii, result.stepLimitReached)) {
      rays.push(ray);
    }
  }
  return rays;
}
