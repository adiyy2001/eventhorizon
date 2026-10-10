import { defaultSettings, mergeSettings, type RenderSettings } from '../src/core/render/settings';

export interface CpuGpuScenario {
  name: string;
  settings: RenderSettings;
}

export const cpuGpuEdge = 128;
export const cpuGpuMeanAbsoluteTolerance = 0.25;

const degrees = (value: number): number => (value * Math.PI) / 180;

export const cpuGpuScenarios: CpuGpuScenario[] = [
  { name: 'default view', settings: defaultSettings },
  {
    name: 'inclination 10 degrees',
    settings: mergeSettings(defaultSettings, { view: { inclination: degrees(10) } }),
  },
  {
    name: 'inclination 85 degrees',
    settings: mergeSettings(defaultSettings, { view: { inclination: degrees(85) } }),
  },
  {
    name: 'lensing off',
    settings: mergeSettings(defaultSettings, { view: { lensing: false } }),
  },
  {
    name: 'doppler beaming and redshift off',
    settings: mergeSettings(defaultSettings, {
      view: { doppler: false, gravitationalRedshift: false },
    }),
  },
  {
    name: 'hot disk with a wide field of view',
    settings: mergeSettings(defaultSettings, {
      view: { peakTemperature: 12000, verticalFieldOfView: degrees(60), distance: 30 },
    }),
  },
  {
    name: 'strong bloom and exposure',
    settings: mergeSettings(defaultSettings, { exposure: 1.5, bloomStrength: 0.3 }),
  },
  {
    name: 'shadow edge overlay',
    settings: mergeSettings(defaultSettings, { overlays: { shadowEdge: true } }),
  },
  {
    name: 'split comparison',
    settings: mergeSettings(defaultSettings, { split: { enabled: true, position: 0.4 } }),
  },
];
