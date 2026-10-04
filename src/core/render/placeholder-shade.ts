import {
  combineRedshift,
  diskTemperature,
  type RedshiftSwitches,
  redshiftParts,
} from '../physics/disk';

export const checkerCellsAround = 8;
export const checkerBright = 0.3;
export const checkerDark = 0.1;

export function checkerShade(x: number, y: number, z: number): number {
  const azimuthCell = Math.floor((checkerCellsAround * Math.atan2(z, x)) / (2 * Math.PI));
  const elevationCell = Math.floor(
    (checkerCellsAround * Math.asin(Math.min(1, Math.max(-1, y)))) / Math.PI,
  );
  return ((azimuthCell + elevationCell) & 1) === 0 ? checkerBright : checkerDark;
}

export function diskShade(
  radius: number,
  photonAngularMomentum: number,
  observerDistance: number,
  innerRadius: number,
  switches: RedshiftSwitches,
): number {
  const redshift = combineRedshift(
    redshiftParts(radius, photonAngularMomentum, observerDistance),
    switches,
  );
  const shape = diskTemperature(radius, innerRadius, 1);
  return (redshift * shape) ** 4;
}
