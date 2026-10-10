import { ISCO_RADIUS } from '../physics/constants';
import { type DiskGeometry } from '../physics/disk';
import {
  type CameraBasis,
  cameraBasis,
  type CameraSetup,
  type ViewportSize,
} from '../physics/observer';
import { defaultTraceOptions, type TraceOptions } from '../physics/trace';

export interface ViewDescription {
  distance: number;
  inclination: number;
  azimuth: number;
  verticalFieldOfView: number;
  diskOuterRadius: number;
  peakTemperature: number;
  lensing: boolean;
  higherOrderImages: boolean;
  gravitationalRedshift: boolean;
  doppler: boolean;
}

export const defaultView: ViewDescription = {
  distance: 50,
  inclination: (75 * Math.PI) / 180,
  azimuth: 0,
  verticalFieldOfView: (35 * Math.PI) / 180,
  diskOuterRadius: 16,
  peakTemperature: 6500,
  lensing: true,
  higherOrderImages: true,
  gravitationalRedshift: true,
  doppler: true,
};

export function viewDisk(view: ViewDescription): DiskGeometry {
  return { innerRadius: ISCO_RADIUS, outerRadius: view.diskOuterRadius };
}

export function viewCameraSetup(view: ViewDescription): CameraSetup {
  return {
    distance: view.distance,
    inclination: view.inclination,
    azimuth: view.azimuth,
    verticalFieldOfView: view.verticalFieldOfView,
  };
}

export function viewBasis(view: ViewDescription): CameraBasis {
  return cameraBasis(viewCameraSetup(view));
}

export const viewMaxSteps = 4096;

export function viewTraceOptions(view: ViewDescription): TraceOptions {
  return {
    ...defaultTraceOptions(view.distance, viewDisk(view)),
    maxSteps: viewMaxSteps,
    lensing: view.lensing,
    higherOrderImages: view.higherOrderImages,
  };
}

export function viewHalfExtents(
  view: ViewDescription,
  viewport: ViewportSize,
): { halfWidth: number; halfHeight: number } {
  const halfHeight = Math.tan(0.5 * view.verticalFieldOfView);
  return { halfWidth: (halfHeight * viewport.width) / viewport.height, halfHeight };
}
