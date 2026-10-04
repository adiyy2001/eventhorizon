import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRITICAL_IMPACT_PARAMETER, ISCO_RADIUS } from '../src/core/physics/constants';
import {
  defaultVectorFormOptions,
  deflectionByBinet,
  deflectionByVectorForm,
} from '../src/core/physics/deflection';
import { defaultStepRule } from '../src/core/physics/integrator';
import { cameraBasis, pixelDirection, staticObserverRay } from '../src/core/physics/observer';
import {
  defaultCriticalImpactSearch,
  findCriticalImpactParameter,
} from '../src/core/physics/shadow';
import { defaultTraceOptions, traceRay } from '../src/core/physics/trace';

interface Candidate {
  kappa: number;
  angularWeight: number;
}

const candidates: Candidate[] = [
  { kappa: 0.1, angularWeight: 0.5 },
  { kappa: 0.05, angularWeight: 1 },
  { kappa: 0.03, angularWeight: 0 },
  { kappa: 0.03, angularWeight: 0.5 },
  { kappa: 0.03, angularWeight: 2 },
  { kappa: 0.01, angularWeight: 0.5 },
  { kappa: 0.003, angularWeight: 0.5 },
];

const distance = 30;
const setup = {
  distance,
  inclination: (80 * Math.PI) / 180,
  azimuth: 0,
  verticalFieldOfView: (35 * Math.PI) / 180,
};
const basis = cameraBasis(setup);
const size = 64;

function meanStepsOfView(rule: Candidate): number {
  const options = defaultTraceOptions(distance, { innerRadius: ISCO_RADIUS, outerRadius: 20 });
  options.step = { ...defaultStepRule, ...rule, minStep: 1e-6 };
  options.maxSteps = 500_000;
  let total = 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const direction = pixelDirection(
        basis,
        setup.verticalFieldOfView,
        { width: size, height: size },
        column + 0.5,
        row + 0.5,
      );
      total += traceRay(staticObserverRay(basis.position, direction), options).steps;
    }
  }
  return total / (size * size);
}

const rows = candidates.map((rule) => {
  const traceOptions = defaultTraceOptions(distance, null);
  traceOptions.step = { ...defaultStepRule, ...rule, minStep: 1e-6 };
  traceOptions.maxSteps = 500_000;
  const critical = findCriticalImpactParameter({
    ...defaultCriticalImpactSearch(distance),
    traceOptions,
  });
  const vectorOptions = {
    ...defaultVectorFormOptions('rk4'),
    traceOptions: { ...defaultTraceOptions(1e5, null), step: traceOptions.step, maxSteps: 500_000 },
  };
  return {
    ...rule,
    criticalImpactError: Math.abs(critical.impactParameter - CRITICAL_IMPACT_PARAMETER),
    deflectionErrorAtB5p3: Math.abs(
      deflectionByVectorForm(5.3, vectorOptions) - deflectionByBinet(5.3),
    ),
    deflectionErrorAtB30: Math.abs(
      deflectionByVectorForm(30, vectorOptions) - deflectionByBinet(30),
    ),
    meanStepsPerRay: meanStepsOfView(rule),
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  cpu: cpus()[0]?.model ?? 'unknown',
  view: { size, inclinationDegrees: 80, distance },
  production: { kappa: defaultStepRule.kappa, angularWeight: defaultStepRule.angularWeight },
  rows,
};

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'results'), { recursive: true });
writeFileSync(
  join(here, 'results', 'step-rule-sweep.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log('kappa   weight  b_c error   defl err b=5.3  defl err b=30  mean steps/ray');
for (const row of rows) {
  console.log(
    `${row.kappa.toString().padEnd(7)} ${row.angularWeight.toString().padEnd(7)} ${row.criticalImpactError.toExponential(2).padEnd(11)} ${row.deflectionErrorAtB5p3.toExponential(2).padEnd(15)} ${row.deflectionErrorAtB30.toExponential(2).padEnd(14)} ${row.meanStepsPerRay.toFixed(1)}`,
  );
}
