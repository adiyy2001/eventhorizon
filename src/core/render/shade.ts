import { nebulaRadiance } from '../background/nebula';
import { starRadiance } from '../background/stars';
import { blackbodyRadiance, type TemperatureLut } from '../color/temperature-lut';
import { type Rgb } from '../color/xyz-srgb';
import { combineRedshift, diskTemperature, redshiftParts } from '../physics/disk';
import { type Vec3 } from '../physics/vec3';
import { type ViewDescription, viewDisk } from './view';

export const BLACK: Rgb = [0, 0, 0];

export function diskRadiance(
  radius: number,
  photonAngularMomentum: number,
  view: ViewDescription,
  lut: TemperatureLut,
): Rgb {
  const redshift = combineRedshift(redshiftParts(radius, photonAngularMomentum, view.distance), {
    gravitational: view.gravitationalRedshift,
    doppler: view.doppler,
  });
  const emitted = diskTemperature(radius, viewDisk(view).innerRadius, view.peakTemperature);
  return blackbodyRadiance(lut, emitted * redshift);
}

export function skyRadiance(direction: Vec3, lut: TemperatureLut): Rgb {
  const nebula = nebulaRadiance(direction);
  const stars = starRadiance(direction, lut);
  return [nebula[0] + stars[0], nebula[1] + stars[1], nebula[2] + stars[2]];
}
