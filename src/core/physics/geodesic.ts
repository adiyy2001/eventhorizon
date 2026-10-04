import { SCHWARZSCHILD_RADIUS } from './constants';
import { cross, type Vec3, vec3 } from './vec3';

export interface RayState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export function createRayState(position: Vec3, velocity: Vec3): RayState {
  return {
    x: position.x,
    y: position.y,
    z: position.z,
    vx: velocity.x,
    vy: velocity.y,
    vz: velocity.z,
  };
}

export function copyRayState(state: RayState): RayState {
  return { ...state };
}

export function radiusOf(state: RayState): number {
  return Math.hypot(state.x, state.y, state.z);
}

export function positionOf(state: RayState): Vec3 {
  return vec3(state.x, state.y, state.z);
}

export function velocityOf(state: RayState): Vec3 {
  return vec3(state.vx, state.vy, state.vz);
}

export function angularMomentumVector(state: RayState): Vec3 {
  return cross(positionOf(state), velocityOf(state));
}

export function angularMomentumSquared(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
): number {
  const cx = y * vz - z * vy;
  const cy = z * vx - x * vz;
  const cz = x * vy - y * vx;
  return cx * cx + cy * cy + cz * cz;
}

export function accelerationFactor(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
): number {
  const radiusSquared = x * x + y * y + z * z;
  const radius = Math.sqrt(radiusSquared);
  const hSquared = angularMomentumSquared(x, y, z, vx, vy, vz);
  return (-1.5 * SCHWARZSCHILD_RADIUS * hSquared) / (radiusSquared * radiusSquared * radius);
}

export function nullDrift(state: RayState): number {
  const radius = radiusOf(state);
  const hSquared = angularMomentumSquared(state.x, state.y, state.z, state.vx, state.vy, state.vz);
  const speedSquared = state.vx * state.vx + state.vy * state.vy + state.vz * state.vz;
  return speedSquared - (SCHWARZSCHILD_RADIUS * hSquared) / (radius * radius * radius) - 1;
}

export function impactParameter(state: RayState): number {
  const radius = radiusOf(state);
  const hSquared = angularMomentumSquared(state.x, state.y, state.z, state.vx, state.vy, state.vz);
  const speedSquared = state.vx * state.vx + state.vy * state.vy + state.vz * state.vz;
  const energySquared =
    speedSquared - (SCHWARZSCHILD_RADIUS * hSquared) / (radius * radius * radius);
  return Math.sqrt(hSquared / energySquared);
}

export function photonAngularMomentumAboutAxis(state: RayState): number {
  return -(state.z * state.vx - state.x * state.vz);
}
