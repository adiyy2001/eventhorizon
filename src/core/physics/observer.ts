import { SCHWARZSCHILD_RADIUS } from './constants';
import { createRayState, type RayState } from './geodesic';
import { add, cross, dot, length, normalize, scale, subtract, type Vec3, vec3 } from './vec3';

export interface CameraSetup {
  distance: number;
  inclination: number;
  azimuth: number;
  verticalFieldOfView: number;
}

export interface CameraBasis {
  position: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export function cameraBasis(setup: CameraSetup): CameraBasis {
  if (!(setup.distance > SCHWARZSCHILD_RADIUS)) {
    throw new RangeError('the observer must be outside the horizon');
  }
  const sinInclination = Math.sin(setup.inclination);
  const cosInclination = Math.cos(setup.inclination);
  const sinAzimuth = Math.sin(setup.azimuth);
  const cosAzimuth = Math.cos(setup.azimuth);
  const outward = vec3(sinInclination * cosAzimuth, cosInclination, sinInclination * sinAzimuth);
  const up = vec3(-cosInclination * cosAzimuth, sinInclination, -cosInclination * sinAzimuth);
  const forward = scale(outward, -1);
  return {
    position: scale(outward, setup.distance),
    forward,
    right: cross(forward, up),
    up,
  };
}

export function pixelDirection(
  basis: CameraBasis,
  verticalFieldOfView: number,
  viewport: ViewportSize,
  pixelX: number,
  pixelY: number,
): Vec3 {
  const halfHeight = Math.tan(0.5 * verticalFieldOfView);
  const halfWidth = (halfHeight * viewport.width) / viewport.height;
  const ndcX = (2 * pixelX) / viewport.width - 1;
  const ndcY = 1 - (2 * pixelY) / viewport.height;
  const direction = add(
    basis.forward,
    add(scale(basis.right, ndcX * halfWidth), scale(basis.up, ndcY * halfHeight)),
  );
  return normalize(direction);
}

export function directionAtAngle(basis: CameraBasis, angleFromHole: number): Vec3 {
  return add(
    scale(basis.forward, Math.cos(angleFromHole)),
    scale(basis.up, Math.sin(angleFromHole)),
  );
}

export function staticObserverRay(position: Vec3, localDirection: Vec3): RayState {
  const distance = length(position);
  if (!(distance > SCHWARZSCHILD_RADIUS)) {
    throw new RangeError('the observer must be outside the horizon');
  }
  const direction = normalize(localDirection);
  const inward = scale(position, -1 / distance);
  const cosAngle = dot(direction, inward);
  const tangential = subtract(direction, scale(inward, cosAngle));
  const sinAngle = length(tangential);
  const angularMomentum = (distance * sinAngle) / Math.sqrt(1 - SCHWARZSCHILD_RADIUS / distance);
  const tangentialSpeed = angularMomentum / distance;
  const radialSquared =
    1 +
    (SCHWARZSCHILD_RADIUS * angularMomentum * angularMomentum) / (distance * distance * distance) -
    tangentialSpeed * tangentialSpeed;
  const radialSpeed = Math.sqrt(Math.max(0, radialSquared)) * (cosAngle >= 0 ? 1 : -1);
  const tangentialUnit = sinAngle > 0 ? scale(tangential, 1 / sinAngle) : vec3(0, 0, 0);
  const velocity = add(scale(tangentialUnit, tangentialSpeed), scale(inward, radialSpeed));
  return createRayState(position, velocity);
}

export function impactParameterAtAngle(distance: number, angleFromHole: number): number {
  return (distance * Math.sin(angleFromHole)) / Math.sqrt(1 - SCHWARZSCHILD_RADIUS / distance);
}

export function angleForImpactParameter(distance: number, impactParameter: number): number {
  return Math.asin((impactParameter * Math.sqrt(1 - SCHWARZSCHILD_RADIUS / distance)) / distance);
}
