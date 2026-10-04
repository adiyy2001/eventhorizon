import { HOTTEST_RADIUS_FACTOR, SCHWARZSCHILD_RADIUS } from './constants';

export interface DiskGeometry {
  innerRadius: number;
  outerRadius: number;
}

export interface RedshiftParts {
  gravitational: number;
  observer: number;
  kinematic: number;
  total: number;
}

export interface RedshiftSwitches {
  gravitational: boolean;
  doppler: boolean;
}

export function isInsideAnnulus(radius: number, disk: DiskGeometry): boolean {
  return radius >= disk.innerRadius && radius <= disk.outerRadius;
}

function temperatureShape(radius: number, innerRadius: number): number {
  if (radius <= innerRadius) {
    return 0;
  }
  return Math.pow(radius, -0.75) * Math.pow(1 - Math.sqrt(innerRadius / radius), 0.25);
}

export function diskTemperature(
  radius: number,
  innerRadius: number,
  peakTemperature: number,
): number {
  const peak = temperatureShape(HOTTEST_RADIUS_FACTOR * innerRadius, innerRadius);
  return (peakTemperature * temperatureShape(radius, innerRadius)) / peak;
}

export function keplerianAngularVelocity(radius: number): number {
  return Math.pow(radius, -1.5);
}

export function localOrbitalSpeed(radius: number): number {
  return 1 / Math.sqrt(radius - SCHWARZSCHILD_RADIUS);
}

export function redshiftParts(
  radius: number,
  photonAngularMomentum: number,
  observerDistance: number,
): RedshiftParts {
  const gravitational = Math.sqrt(1 - SCHWARZSCHILD_RADIUS / radius);
  const observer = 1 / Math.sqrt(1 - SCHWARZSCHILD_RADIUS / observerDistance);
  const lorentz = 1 / Math.sqrt(1 - localOrbitalSpeed(radius) ** 2);
  const kinematic = 1 / (lorentz * (1 - keplerianAngularVelocity(radius) * photonAngularMomentum));
  return { gravitational, observer, kinematic, total: gravitational * observer * kinematic };
}

export function combineRedshift(parts: RedshiftParts, switches: RedshiftSwitches): number {
  const gravitational = switches.gravitational ? parts.gravitational * parts.observer : 1;
  const kinematic = switches.doppler ? parts.kinematic : 1;
  return gravitational * kinematic;
}

export function observedTemperature(emittedTemperature: number, redshift: number): number {
  return emittedTemperature * redshift;
}

export function observedIntensityScale(redshift: number): number {
  return redshift ** 4;
}
