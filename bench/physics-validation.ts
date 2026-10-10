import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRITICAL_IMPACT_PARAMETER, ISCO_RADIUS } from '../src/core/physics/constants';
import {
  defaultVectorFormOptions,
  deflectionByBinet,
  deflectionByQuadrature,
  deflectionByVectorForm,
  deflectionSeries,
  weakFieldDeflection,
} from '../src/core/physics/deflection';
import { deflectionByElliptic } from '../src/core/physics/elliptic';
import { keplerianAngularVelocity, redshiftParts } from '../src/core/physics/disk';
import { cameraBasis, pixelDirection, staticObserverRay } from '../src/core/physics/observer';
import {
  defaultCriticalImpactSearch,
  findCriticalImpactParameter,
} from '../src/core/physics/shadow';
import { defaultTraceOptions, traceRay } from '../src/core/physics/trace';
import { maxOf } from '../src/core/validation/metrics';

interface Check {
  name: string;
  value: number;
  limit: number;
  unit: string;
  pass: boolean;
}

const checks: Check[] = [];

function record(name: string, value: number, limit: number, unit: string): void {
  checks.push({ name, value, limit, unit, pass: value <= limit });
}

const impactParameters = [5.3, 5.6, 6, 8, 12, 30, 100, 250, 500];

for (const distance of [10, 30, 100]) {
  const found = findCriticalImpactParameter(defaultCriticalImpactSearch(distance));
  record(
    `critical impact parameter by bisection, D = ${String(distance)}`,
    Math.abs(found.impactParameter - CRITICAL_IMPACT_PARAMETER),
    1e-6,
    'absolute error in b',
  );
}

record(
  'Binet form against vector form (Dormand-Prince), b from 5.3 to 500',
  maxOf(
    impactParameters.map((b) =>
      Math.abs(
        deflectionByBinet(b) -
          deflectionByVectorForm(b, defaultVectorFormOptions('dormand-prince')),
      ),
    ),
  ),
  1e-9,
  'radians',
);

record(
  'Binet form against quadrature of the exact integral',
  maxOf(impactParameters.map((b) => Math.abs(deflectionByBinet(b) - deflectionByQuadrature(b)))),
  1e-8,
  'radians',
);

record(
  'elliptic integral form against quadrature of the exact integral, b from 5.2 to 500',
  maxOf(
    [5.2, ...impactParameters].map((b) =>
      Math.abs(deflectionByElliptic(b) - deflectionByQuadrature(b)),
    ),
  ),
  1e-10,
  'radians',
);

record(
  'production RK4 tracer against Binet form',
  maxOf(
    impactParameters.map((b) =>
      Math.abs(deflectionByBinet(b) - deflectionByVectorForm(b, defaultVectorFormOptions('rk4'))),
    ),
  ),
  2e-6,
  'radians',
);

record(
  'third order series against exact deflection, b = 100',
  Math.abs(deflectionSeries(100) - deflectionByQuadrature(100)),
  5e-6,
  'radians',
);

record(
  'third order series against exact deflection, b = 500',
  Math.abs(deflectionSeries(500) - deflectionByQuadrature(500)),
  2e-8,
  'radians',
);

const leadingTermErrors = [100, 200, 400].map((b) => {
  const exact = deflectionByQuadrature(b);
  return (exact - weakFieldDeflection(b)) / exact;
});
record(
  'leading term 4M/b relative error at b = 400',
  leadingTermErrors[2] ?? Number.NaN,
  leadingTermErrors[1] ?? Number.NaN,
  'relative error, must be below the value at b = 200',
);

const distance = 30;
const setup = {
  distance,
  inclination: (80 * Math.PI) / 180,
  azimuth: 0,
  verticalFieldOfView: (35 * Math.PI) / 180,
};
const basis = cameraBasis(setup);
const size = 128;
const options = {
  ...defaultTraceOptions(distance, { innerRadius: ISCO_RADIUS, outerRadius: 20 }),
  trackDrift: true,
};
const driftsH: number[] = [];
const driftsNull: number[] = [];
const outcomes = { captured: 0, escaped: 0, disk: 0 };
let totalSteps = 0;
let maxSteps = 0;
const started = performance.now();
for (let row = 0; row < size; row += 1) {
  for (let column = 0; column < size; column += 1) {
    const direction = pixelDirection(
      basis,
      setup.verticalFieldOfView,
      { width: size, height: size },
      column + 0.5,
      row + 0.5,
    );
    const result = traceRay(staticObserverRay(basis.position, direction), options);
    driftsH.push(result.maxRelativeAngularMomentumDrift);
    driftsNull.push(result.maxNullDrift);
    outcomes[result.outcome] += 1;
    totalSteps += result.steps;
    maxSteps = Math.max(maxSteps, result.steps);
  }
}
const elapsedMilliseconds = performance.now() - started;

record('h relative drift over a 128 x 128 view at 80 degrees', maxOf(driftsH), 1e-8, 'relative');
record('null condition drift over the same view', maxOf(driftsNull), 1e-6, 'absolute');

const sqrtHalf = Math.SQRT1_2;
record(
  'redshift at the ISCO for lambda = 0',
  Math.abs(redshiftParts(ISCO_RADIUS, 0, 1e12).total - sqrtHalf),
  1e-9,
  'absolute error in g',
);
record(
  'redshift at r = 8, lambda = 3, against the hand-computed value',
  Math.abs(
    redshiftParts(8, 3, 1e12).total - Math.sqrt(1 - 3 / 8) / (1 - keplerianAngularVelocity(8) * 3),
  ),
  1e-9,
  'absolute error in g',
);

const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: `${platform()} ${release()} ${arch()}`,
    cpu: cpus()[0]?.model ?? 'unknown',
    cores: cpus().length,
  },
  view: {
    size,
    inclinationDegrees: 80,
    distance,
    outcomes,
    meanSteps: totalSteps / (size * size),
    maxSteps,
  },
  timing: {
    raysPerSecond: Math.round((size * size) / (elapsedMilliseconds / 1000)),
    elapsedMilliseconds: Math.round(elapsedMilliseconds),
  },
  checks,
  passed: checks.every((check) => check.pass),
};

const here = dirname(fileURLToPath(import.meta.url));
const resultsDirectory = join(here, 'results');
mkdirSync(resultsDirectory, { recursive: true });
writeFileSync(
  join(resultsDirectory, 'physics-validation.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

const widest = Math.max(...checks.map((check) => check.name.length));
for (const check of checks) {
  const status = check.pass ? 'pass' : 'FAIL';
  console.log(
    `${status}  ${check.name.padEnd(widest)}  ${check.value.toExponential(3)}  limit ${check.limit.toExponential(3)}  ${check.unit}`,
  );
}
console.log(
  `${String(size * size)} rays, mean ${(totalSteps / (size * size)).toFixed(1)} steps, max ${String(maxSteps)}, ${String(report.timing.raysPerSecond)} rays/s on ${report.environment.cpu}`,
);

process.exit(report.passed ? 0 : 1);
