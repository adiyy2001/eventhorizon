import { CRITICAL_IMPACT_PARAMETER, SCHWARZSCHILD_RADIUS } from './constants';
import { dormandPrinceTrace, defaultDormandPrinceOptions } from './dormand-prince';
import { angularMomentumVector, radiusOf, type RayState, velocityOf } from './geodesic';
import { defaultStepRule } from './integrator';
import {
  cameraBasis,
  directionAtAngle,
  staticObserverRay,
  angleForImpactParameter,
} from './observer';
import { traceRay, defaultTraceOptions, type TraceOptions } from './trace';
import { cross, dot, normalize, type Vec3 } from './vec3';

function requireBoundRay(impactParameter: number): void {
  if (!(impactParameter > CRITICAL_IMPACT_PARAMETER)) {
    throw new RangeError('rays below the critical impact parameter are captured');
  }
}

export function weakFieldDeflection(impactParameter: number): number {
  return (2 * SCHWARZSCHILD_RADIUS) / impactParameter;
}

export function deflectionSeries(impactParameter: number): number {
  const ratio = 1 / impactParameter;
  return 4 * ratio + ((15 * Math.PI) / 4) * ratio ** 2 + (128 / 3) * ratio ** 3;
}

export function asymptoticTailDeflection(angularMomentum: number, radius: number): number {
  return (0.375 * SCHWARZSCHILD_RADIUS * angularMomentum ** 3) / radius ** 4;
}

interface BinetState {
  u: number;
  slope: number;
}

function binetDerivative(state: BinetState): BinetState {
  return { u: state.slope, slope: -state.u + 3 * state.u * state.u };
}

function binetStep(state: BinetState, step: number): BinetState {
  const k1 = binetDerivative(state);
  const k2 = binetDerivative({
    u: state.u + 0.5 * step * k1.u,
    slope: state.slope + 0.5 * step * k1.slope,
  });
  const k3 = binetDerivative({
    u: state.u + 0.5 * step * k2.u,
    slope: state.slope + 0.5 * step * k2.slope,
  });
  const k4 = binetDerivative({ u: state.u + step * k3.u, slope: state.slope + step * k3.slope });
  return {
    u: state.u + (step / 6) * (k1.u + 2 * k2.u + 2 * k3.u + k4.u),
    slope: state.slope + (step / 6) * (k1.slope + 2 * k2.slope + 2 * k3.slope + k4.slope),
  };
}

export function deflectionByBinet(impactParameter: number, angleStep = 1e-3): number {
  requireBoundRay(impactParameter);
  let state: BinetState = { u: 0, slope: 1 / impactParameter };
  let angle = 0;
  let turned = false;
  for (;;) {
    const next = binetStep(state, angleStep);
    turned = turned || next.slope < 0;
    if (turned && next.u <= 0) {
      let fraction = angleStep * (state.u / (state.u - next.u));
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const probe = binetStep(state, fraction);
        fraction -= probe.u / probe.slope;
      }
      return angle + fraction - Math.PI;
    }
    state = next;
    angle += angleStep;
  }
}

export function turningPointInverseRadius(impactParameter: number): number {
  requireBoundRay(impactParameter);
  const inverseSquare = 1 / (impactParameter * impactParameter);
  let low = 0;
  let high = 1 / 3;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = 0.5 * (low + high);
    const value = inverseSquare - middle * middle + 2 * middle ** 3;
    if (value > 0) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return 0.5 * (low + high);
}

interface GaussRule {
  nodes: number[];
  weights: number[];
}

function gaussLegendreRule(order: number): GaussRule {
  const nodes: number[] = [];
  const weights: number[] = [];
  for (let index = 0; index < order; index += 1) {
    let node = Math.cos((Math.PI * (index + 0.75)) / (order + 0.5));
    let derivative = 1;
    for (let iteration = 0; iteration < 100; iteration += 1) {
      let previous = 1;
      let current = node;
      for (let degree = 2; degree <= order; degree += 1) {
        const next = ((2 * degree - 1) * node * current - (degree - 1) * previous) / degree;
        previous = current;
        current = next;
      }
      derivative = (order * (node * current - previous)) / (node * node - 1);
      const correction = current / derivative;
      node -= correction;
      if (Math.abs(correction) < 1e-16) {
        break;
      }
    }
    nodes.push(node);
    weights.push(2 / ((1 - node * node) * derivative * derivative));
  }
  return { nodes, weights };
}

const quadratureRule = gaussLegendreRule(24);

function compositeIntegral(
  integrand: (value: number) => number,
  upper: number,
  panels: number,
): number {
  const width = upper / panels;
  let total = 0;
  for (let panel = 0; panel < panels; panel += 1) {
    const center = (panel + 0.5) * width;
    for (const [index, node] of quadratureRule.nodes.entries()) {
      total +=
        (quadratureRule.weights[index] ?? 0) * 0.5 * width * integrand(center + 0.5 * width * node);
    }
  }
  return total;
}

export function deflectionByQuadrature(impactParameter: number): number {
  const turning = turningPointInverseRadius(impactParameter);
  const integrand = (substitution: number): number => {
    const inverseRadius = turning - substitution * substitution;
    const shape = (1 - 2 * turning) * (inverseRadius + turning) - 2 * inverseRadius * inverseRadius;
    return 2 / Math.sqrt(shape);
  };
  const upper = Math.sqrt(turning);
  let panels = 4;
  let previous = compositeIntegral(integrand, upper, panels);
  for (let refinement = 0; refinement < 12; refinement += 1) {
    panels *= 2;
    const refined = compositeIntegral(integrand, upper, panels);
    if (Math.abs(refined - previous) < 1e-15 * Math.abs(refined)) {
      previous = refined;
      break;
    }
    previous = refined;
  }
  return 2 * previous - Math.PI;
}

export type VectorFormIntegrator = 'dormand-prince' | 'rk4';

export interface VectorFormOptions {
  integrator: VectorFormIntegrator;
  radius: number;
  tolerance: number;
  traceOptions: TraceOptions | null;
}

export function defaultVectorFormOptions(integrator: VectorFormIntegrator): VectorFormOptions {
  return { integrator, radius: 1e5, tolerance: 1e-13, traceOptions: null };
}

function incomingRay(impactParameter: number, radius: number): RayState {
  const basis = cameraBasis({
    distance: radius,
    inclination: Math.PI / 2,
    azimuth: 0,
    verticalFieldOfView: 1,
  });
  const angle = angleForImpactParameter(radius, impactParameter);
  return staticObserverRay(basis.position, directionAtAngle(basis, angle));
}

function rotationAboutAxis(from: Vec3, to: Vec3, axis: Vec3): number {
  const angle = Math.atan2(dot(cross(from, to), axis), dot(from, to));
  return angle < 0 ? angle + 2 * Math.PI : angle;
}

export function deflectionByVectorForm(
  impactParameter: number,
  options: VectorFormOptions,
): number {
  requireBoundRay(impactParameter);
  const start = incomingRay(impactParameter, options.radius);
  const incoming = velocityOf(start);
  const axis = normalize(angularMomentumVector(start));
  const end =
    options.integrator === 'dormand-prince'
      ? dormandPrinceTrace(start, {
          ...defaultDormandPrinceOptions(),
          tolerance: options.tolerance,
          escapeRadius: options.radius,
          initialStep: 1,
        }).state
      : traceRay(start, {
          ...(options.traceOptions ?? defaultTraceOptions(options.radius, null)),
          step: { ...defaultStepRule, maxStep: options.radius },
          escapeRadius: options.radius,
        }).finalState;
  const measured = rotationAboutAxis(incoming, velocityOf(end), axis);
  return (
    measured +
    asymptoticTailDeflection(impactParameter, options.radius) +
    asymptoticTailDeflection(impactParameter, radiusOf(end))
  );
}
