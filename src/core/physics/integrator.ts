import { accelerationFactor, angularMomentumSquared, type RayState } from './geodesic';

export interface StepRule {
  kappa: number;
  angularWeight: number;
  minStep: number;
  maxStep: number;
}

export const defaultStepRule: StepRule = {
  kappa: 0.03,
  angularWeight: 0.5,
  minStep: 1e-4,
  maxStep: 4,
};

export function stepSize(rule: StepRule, state: RayState, lensing: boolean): number {
  const radiusSquared = state.x * state.x + state.y * state.y + state.z * state.z;
  const radius = Math.sqrt(radiusSquared);
  let size = rule.kappa * radius;
  if (lensing) {
    const hSquared = angularMomentumSquared(
      state.x,
      state.y,
      state.z,
      state.vx,
      state.vy,
      state.vz,
    );
    size /= 1 + (rule.angularWeight * hSquared) / radiusSquared;
  }
  return Math.min(rule.maxStep, Math.max(rule.minStep, size));
}

export function rk4Step(state: RayState, dt: number, lensing: boolean): void {
  const half = 0.5 * dt;
  const { x, y, z, vx, vy, vz } = state;

  const f1 = lensing ? accelerationFactor(x, y, z, vx, vy, vz) : 0;
  const a1x = f1 * x;
  const a1y = f1 * y;
  const a1z = f1 * z;

  const x2 = x + half * vx;
  const y2 = y + half * vy;
  const z2 = z + half * vz;
  const v2x = vx + half * a1x;
  const v2y = vy + half * a1y;
  const v2z = vz + half * a1z;
  const f2 = lensing ? accelerationFactor(x2, y2, z2, v2x, v2y, v2z) : 0;
  const a2x = f2 * x2;
  const a2y = f2 * y2;
  const a2z = f2 * z2;

  const x3 = x + half * v2x;
  const y3 = y + half * v2y;
  const z3 = z + half * v2z;
  const v3x = vx + half * a2x;
  const v3y = vy + half * a2y;
  const v3z = vz + half * a2z;
  const f3 = lensing ? accelerationFactor(x3, y3, z3, v3x, v3y, v3z) : 0;
  const a3x = f3 * x3;
  const a3y = f3 * y3;
  const a3z = f3 * z3;

  const x4 = x + dt * v3x;
  const y4 = y + dt * v3y;
  const z4 = z + dt * v3z;
  const v4x = vx + dt * a3x;
  const v4y = vy + dt * a3y;
  const v4z = vz + dt * a3z;
  const f4 = lensing ? accelerationFactor(x4, y4, z4, v4x, v4y, v4z) : 0;
  const a4x = f4 * x4;
  const a4y = f4 * y4;
  const a4z = f4 * z4;

  const sixth = dt / 6;
  state.x = x + sixth * (vx + 2 * v2x + 2 * v3x + v4x);
  state.y = y + sixth * (vy + 2 * v2y + 2 * v3y + v4y);
  state.z = z + sixth * (vz + 2 * v2z + 2 * v3z + v4z);
  state.vx = vx + sixth * (a1x + 2 * a2x + 2 * a3x + a4x);
  state.vy = vy + sixth * (a1y + 2 * a2y + 2 * a3y + a4y);
  state.vz = vz + sixth * (a1z + 2 * a2z + 2 * a3z + a4z);
}
