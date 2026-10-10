import { type RenderSettings, defaultSettings } from '../src/core/render/settings';
import { defaultView } from '../src/core/render/view';

export interface BaselineSpec {
  name: string;
  settings: RenderSettings;
  size: number;
  frames: number;
}

const degrees = (value: number): number => (value * Math.PI) / 180;

const baselineSize = 256;
const baselineFrames = 4;

function baseline(name: string, change: Partial<RenderSettings['view']>): BaselineSpec {
  return {
    name,
    settings: { ...defaultSettings, view: { ...defaultView, ...change } },
    size: baselineSize,
    frames: baselineFrames,
  };
}

const overlaysAndSplit: BaselineSpec = {
  name: 'overlays-and-split',
  settings: {
    ...defaultSettings,
    view: { ...defaultView, doppler: false, inclination: degrees(80) },
    overlays: { photonSphere: true, isco: true, shadowEdge: true },
    split: { enabled: true, position: 0.5 },
  },
  size: baselineSize,
  frames: baselineFrames,
};

export const baselineSpecs: BaselineSpec[] = [
  baseline('full-model', {}),
  baseline('inclination-10', { inclination: degrees(10) }),
  baseline('inclination-80', { inclination: degrees(80) }),
  baseline('lensing-off', { lensing: false }),
  baseline('doppler-off', { doppler: false }),
  baseline('redshift-off', { gravitationalRedshift: false }),
  baseline('higher-order-off', { higherOrderImages: false, inclination: degrees(85) }),
  baseline('temperature-3500', { peakTemperature: 3500 }),
  baseline('temperature-9000', { peakTemperature: 9000 }),
  overlaysAndSplit,
];

export const baselineDirectory = 'e2e/baselines';

export const baselineMeanAbsoluteTolerance = 0.5;

export const baselineMaxAbsoluteTolerance = 64;
