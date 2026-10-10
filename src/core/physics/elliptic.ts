import { SCHWARZSCHILD_RADIUS } from './constants';
import { turningPointInverseRadius } from './deflection';

const CARLSON_TOLERANCE = 1e-6;
const CARLSON_MAX_ITERATIONS = 100;

export function carlsonRf(x: number, y: number, z: number): number {
  let first = x;
  let second = y;
  let third = z;
  let mean = (first + second + third) / 3;
  let deviationFirst = 0;
  let deviationSecond = 0;
  let deviationThird = 0;
  for (let iteration = 0; iteration < CARLSON_MAX_ITERATIONS; iteration += 1) {
    const rootFirst = Math.sqrt(first);
    const rootSecond = Math.sqrt(second);
    const rootThird = Math.sqrt(third);
    const lambda = rootFirst * (rootSecond + rootThird) + rootSecond * rootThird;
    first = 0.25 * (first + lambda);
    second = 0.25 * (second + lambda);
    third = 0.25 * (third + lambda);
    mean = (first + second + third) / 3;
    deviationFirst = (mean - first) / mean;
    deviationSecond = (mean - second) / mean;
    deviationThird = (mean - third) / mean;
    const largest = Math.max(
      Math.abs(deviationFirst),
      Math.abs(deviationSecond),
      Math.abs(deviationThird),
    );
    if (largest < CARLSON_TOLERANCE) {
      break;
    }
  }
  const e2 = deviationFirst * deviationSecond - deviationThird * deviationThird;
  const e3 = deviationFirst * deviationSecond * deviationThird;
  return (1 + (e2 / 24 - 0.1 - (3 * e3) / 44) * e2 + e3 / 14) / Math.sqrt(mean);
}

export function incompleteEllipticF(amplitude: number, parameter: number): number {
  const sine = Math.sin(amplitude);
  const cosine = Math.cos(amplitude);
  return sine * carlsonRf(cosine * cosine, 1 - parameter * sine * sine, 1);
}

export function completeEllipticK(parameter: number): number {
  return carlsonRf(0, 1 - parameter, 1);
}

export function deflectionByElliptic(impactParameter: number): number {
  const periastron = 1 / turningPointInverseRadius(impactParameter);
  const mass = SCHWARZSCHILD_RADIUS / 2;
  const root = Math.sqrt((periastron - 2 * mass) * (periastron + 6 * mass));
  const parameter = (root - periastron + 6 * mass) / (2 * root);
  const amplitude = Math.asin(
    Math.sqrt((root - periastron + 2 * mass) / (root - periastron + 6 * mass)),
  );
  return (
    4 *
      Math.sqrt(periastron / root) *
      (completeEllipticK(parameter) - incompleteEllipticF(amplitude, parameter)) -
    Math.PI
  );
}
