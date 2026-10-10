import { CRITICAL_IMPACT_PARAMETER, ISCO_RADIUS } from './constants';
import { createRayState } from './geodesic';
import { defaultStepRule } from './integrator';
import {
  angleForImpactParameter,
  cameraBasis,
  directionAtAngle,
  pixelDirection,
  staticObserverRay,
} from './observer';
import {
  defaultTraceOptions,
  locatePlaneCrossing,
  traceRay,
  type TraceOptions,
  type TraceResult,
} from './trace';
import { vec3 } from './vec3';

const disk = { innerRadius: ISCO_RADIUS, outerRadius: 20 };
const distance = 30;
const equatorialBasis = cameraBasis({
  distance,
  inclination: Math.PI / 2,
  azimuth: 0,
  verticalFieldOfView: 1,
});
const tiltedSetup = {
  distance,
  inclination: (80 * Math.PI) / 180,
  azimuth: 0,
  verticalFieldOfView: (35 * Math.PI) / 180,
};
const tiltedBasis = cameraBasis(tiltedSetup);

function rayAtImpactParameter(b: number) {
  const angle = angleForImpactParameter(distance, b);
  return staticObserverRay(equatorialBasis.position, directionAtAngle(equatorialBasis, angle));
}

function straightRay(impact: number) {
  return createRayState(vec3(30, impact, 0), vec3(-1, 0, 0));
}

function tiltedPixelRay(column: number, row: number, size: number) {
  const direction = pixelDirection(
    tiltedBasis,
    tiltedSetup.verticalFieldOfView,
    { width: size, height: size },
    column + 0.5,
    row + 0.5,
  );
  return staticObserverRay(tiltedBasis.position, direction);
}

function options(overrides: Partial<TraceOptions> = {}): TraceOptions {
  return { ...defaultTraceOptions(distance, disk), ...overrides };
}

function gridOutcomes(overrides: Partial<TraceOptions>, size: number): TraceResult[] {
  const results: TraceResult[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      results.push(traceRay(tiltedPixelRay(column, row, size), options(overrides)));
    }
  }
  return results;
}

const tiltedGridSize = 96;
const heavyGridTimeout = 60_000;
let cachedTiltedGrid: TraceResult[] | null = null;

function fullTiltedGrid(): TraceResult[] {
  cachedTiltedGrid ??= gridOutcomes({}, tiltedGridSize);
  return cachedTiltedGrid;
}

describe('traceRay termination', () => {
  it('captures rays below the critical impact parameter and releases rays above it', () => {
    const bare = options({ disk: null });
    expect(traceRay(rayAtImpactParameter(5.0), bare).outcome).toBe('captured');
    expect(traceRay(rayAtImpactParameter(5.1), bare).outcome).toBe('captured');
    expect(traceRay(rayAtImpactParameter(5.3), bare).outcome).toBe('escaped');
    expect(traceRay(rayAtImpactParameter(8), bare).outcome).toBe('escaped');
    expect(CRITICAL_IMPACT_PARAMETER).toBeGreaterThan(5.1);
    expect(CRITICAL_IMPACT_PARAMETER).toBeLessThan(5.3);
  });

  it('escapes at once when starting outside the escape radius and moving away', () => {
    const outward = createRayState(vec3(150, 0, 0), vec3(1, 0.01, 0));
    const result = traceRay(outward, options({ disk: null }));
    expect(result.outcome).toBe('escaped');
    expect(result.steps).toBe(0);
  });

  it('flags a ray that runs out of steps and counts it as captured', () => {
    const result = traceRay(rayAtImpactParameter(8), options({ maxSteps: 5 }));
    expect(result.stepLimitReached).toBe(true);
    expect(result.outcome).toBe('captured');
    expect(result.steps).toBe(5);
  });

  it('returns a unit final direction for an escaped ray', () => {
    const result = traceRay(rayAtImpactParameter(8), options({ disk: null }));
    const { x, y, z } = result.finalDirection;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 14);
  });

  it('changes the final direction by less than the analytic tail when the escape radius grows', () => {
    const b = 12;
    const near = traceRay(rayAtImpactParameter(b), options({ disk: null, escapeRadius: 100 }));
    const far = traceRay(
      rayAtImpactParameter(b),
      options({ disk: null, escapeRadius: 20000, step: { ...defaultStepRule, maxStep: 400 } }),
    );
    const dot =
      near.finalDirection.x * far.finalDirection.x +
      near.finalDirection.y * far.finalDirection.y +
      near.finalDirection.z * far.finalDirection.z;
    const difference = Math.acos(Math.min(1, dot));
    const tail = (0.375 * 2 * b ** 3) / 100 ** 4;
    expect(difference).toBeLessThan(1.5 * tail);
    expect(difference).toBeGreaterThan(0.5 * tail);
  });
});

describe('traceRay without lensing', () => {
  it('moves in straight lines and hits the opaque sphere exactly below its radius', () => {
    const straight = options({ lensing: false, disk: null });
    expect(traceRay(straightRay(1.99), straight).outcome).toBe('captured');
    expect(traceRay(straightRay(2.001), straight).outcome).toBe('captured');
    expect(traceRay(straightRay(2.01), straight).outcome).toBe('escaped');
    expect(traceRay(straightRay(-1.5), straight).outcome).toBe('captured');
    const missed = traceRay(straightRay(2.01), straight);
    expect(missed.finalDirection.x).toBeCloseTo(-1, 14);
    expect(missed.finalDirection.y).toBeCloseTo(0, 14);
  });

  it('does not capture a ray passing the critical impact parameter that lensing would capture', () => {
    const withLensing = traceRay(rayAtImpactParameter(4.5), options({ disk: null }));
    const straight = traceRay(straightRay(4.5), options({ lensing: false, disk: null }));
    expect(withLensing.outcome).toBe('captured');
    expect(straight.outcome).toBe('escaped');
  });
});

describe('traceRay conservation', () => {
  it('conserves h to 1e-8 and the null condition to 1e-6 with the production step rule', () => {
    const rays = [5.0, 5.2, 5.2162, 5.5, 7, 12, 30].map(rayAtImpactParameter);
    for (const ray of rays) {
      const result = traceRay(ray, options({ trackDrift: true, disk: null }));
      expect(result.maxRelativeAngularMomentumDrift).toBeLessThan(1e-8);
      expect(result.maxNullDrift).toBeLessThan(1e-6);
    }
  });

  it('conserves h to 1e-12 with a step one tenth as large', () => {
    const fine = { ...defaultStepRule, kappa: defaultStepRule.kappa / 10, minStep: 1e-6 };
    for (const b of [5.5, 7, 12]) {
      const result = traceRay(
        rayAtImpactParameter(b),
        options({ trackDrift: true, disk: null, step: fine, maxSteps: 200_000 }),
      );
      expect(result.maxRelativeAngularMomentumDrift).toBeLessThan(1e-12);
      expect(result.maxNullDrift).toBeLessThan(1e-10);
    }
  });

  it('keeps the disk axis angular momentum fixed along the ray', () => {
    let checked = 0;
    for (const [column, row] of [
      [48, 70],
      [30, 60],
      [60, 66],
      [48, 20],
    ] as const) {
      const ray = tiltedPixelRay(column, row, 96);
      const start = -(ray.z * ray.vx - ray.x * ray.vz);
      for (const crossing of traceRay(ray, options()).crossings) {
        expect(Math.abs(crossing.lambda - start)).toBeLessThan(1e-7);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });
});

describe('disk crossings', () => {
  it('finds the crossing of a straight ray in the plane geometry exactly', () => {
    const ray = createRayState(vec3(30, 10, 0), vec3(-1, -0.25, 0));
    const result = traceRay(ray, options({ lensing: false }));
    expect(result.outcome).toBe('disk');
    expect(result.diskHit?.radius).toBeCloseTo(10, 9);
  });

  it('locates a crossing in a lensed ray as precisely as a thousand times finer steps', () => {
    const fine = {
      ...defaultStepRule,
      kappa: defaultStepRule.kappa / 1000,
      minStep: 1e-9,
      maxStep: 0.004,
    };
    let compared = 0;
    for (const [column, row] of [
      [30, 60],
      [60, 70],
      [48, 70],
      [60, 66],
      [20, 50],
    ] as const) {
      const ray = tiltedPixelRay(column, row, 96);
      const coarse = traceRay(ray, options());
      const reference = traceRay(ray, options({ step: fine, maxSteps: 5_000_000 }));
      expect(coarse.outcome).toBe(reference.outcome);
      if (coarse.diskHit !== null && reference.diskHit !== null) {
        expect(Math.abs(coarse.diskHit.radius - reference.diskHit.radius)).toBeLessThan(1e-6);
        compared += 1;
      }
    }
    expect(compared).toBe(4);
  });

  it('only reports disk hits inside the annulus and misses outside it', () => {
    const results = gridOutcomes({}, 48);
    for (const result of results) {
      for (const crossing of result.crossings) {
        const inside = crossing.radius >= disk.innerRadius && crossing.radius <= disk.outerRadius;
        expect(crossing.hitsDisk).toBe(inside);
      }
      if (result.outcome === 'disk') {
        expect(result.diskHit?.hitsDisk).toBe(true);
        expect(result.diskHit?.radius).toBeGreaterThanOrEqual(disk.innerRadius);
        expect(result.diskHit?.radius).toBeLessThanOrEqual(disk.outerRadius);
      }
    }
  });
});

describe('higher-order images', () => {
  it(
    'contains rays with several plane crossings and rays that miss first and hit later',
    () => {
      const results = fullTiltedGrid();
      const multiple = results.filter((result) => result.crossings.length >= 2);
      const lateHits = results.filter(
        (result) =>
          result.outcome === 'disk' &&
          (result.diskHit?.index ?? 0) >= 2 &&
          result.crossings.slice(0, -1).every((crossing) => !crossing.hitsDisk),
      );
      expect(multiple.length).toBeGreaterThan(20);
      expect(lateHits.length).toBeGreaterThan(20);
    },
    heavyGridTimeout,
  );

  it(
    'turns those late hits into plain escapes or captures when higher orders are off',
    () => {
      const full = fullTiltedGrid();
      const first = gridOutcomes({ higherOrderImages: false }, tiltedGridSize);
      let changed = 0;
      full.forEach((result, index) => {
        const restricted = first[index];
        if (restricted === undefined) {
          throw new Error('grid size mismatch');
        }
        if (result.outcome === 'disk' && (result.diskHit?.index ?? 0) >= 2) {
          expect(restricted.outcome).not.toBe('disk');
          changed += 1;
        } else {
          expect(restricted.outcome).toBe(result.outcome);
        }
        expect(restricted.crossings.length).toBeLessThanOrEqual(1);
      });
      expect(changed).toBeGreaterThan(20);
    },
    heavyGridTimeout,
  );
});

describe('beaming geometry', () => {
  it(
    'makes the side moving towards the camera bluer than the receding side',
    () => {
      let approachingTotal = 0;
      let approachingCount = 0;
      let recedingTotal = 0;
      let recedingCount = 0;
      for (const result of fullTiltedGrid()) {
        const hit = result.diskHit;
        if (hit?.index !== 1 || hit.radius < 9 || hit.radius > 13) {
          continue;
        }
        const emitterVelocityTowardCamera =
          hit.z * tiltedBasis.position.x - hit.x * tiltedBasis.position.z;
        const omegaLambda = hit.lambda * Math.pow(hit.radius, -1.5);
        if (emitterVelocityTowardCamera > 0) {
          approachingTotal += omegaLambda;
          approachingCount += 1;
        } else {
          recedingTotal += omegaLambda;
          recedingCount += 1;
        }
      }
      expect(approachingCount).toBeGreaterThan(50);
      expect(recedingCount).toBeGreaterThan(50);
      expect(approachingTotal / approachingCount).toBeGreaterThan(0.01);
      expect(recedingTotal / recedingCount).toBeLessThan(-0.01);
    },
    heavyGridTimeout,
  );
});

describe('locatePlaneCrossing', () => {
  it('returns the exact fraction for a linear motion through the plane', () => {
    const previous = createRayState(vec3(0, 1, 0), vec3(0, -2, 0));
    const current = createRayState(vec3(0, -1, 0), vec3(0, -2, 0));
    expect(locatePlaneCrossing(previous, current, 1)).toBeCloseTo(0.5, 14);
  });

  it('finds the root of a curved motion between the endpoints', () => {
    const previous = createRayState(vec3(0, 1, 0), vec3(0, -1, 0));
    const current = createRayState(vec3(0, -0.5, 0), vec3(0, -3, 0));
    const fraction = locatePlaneCrossing(previous, current, 1);
    expect(fraction).toBeGreaterThan(0);
    expect(fraction).toBeLessThan(1);
  });
});
