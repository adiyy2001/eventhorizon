import { defaultView, type ViewDescription } from '../src/core/render/view';

export interface BaselineSpec {
  name: string;
  view: ViewDescription;
  size: number;
  frames: number;
}

const degrees = (value: number): number => (value * Math.PI) / 180;

const baselineSize = 256;
const baselineFrames = 4;

function inclinationBaseline(angle: number): BaselineSpec {
  return {
    name: `inclination-${String(angle)}`,
    view: { ...defaultView, inclination: degrees(angle) },
    size: baselineSize,
    frames: baselineFrames,
  };
}

function temperatureBaseline(kelvin: number): BaselineSpec {
  return {
    name: `temperature-${String(kelvin)}`,
    view: { ...defaultView, inclination: degrees(75), peakTemperature: kelvin },
    size: baselineSize,
    frames: baselineFrames,
  };
}

export const baselineSpecs: BaselineSpec[] = [
  inclinationBaseline(10),
  inclinationBaseline(45),
  inclinationBaseline(80),
  temperatureBaseline(3500),
  temperatureBaseline(5500),
  temperatureBaseline(9000),
];

export const baselineDirectory = 'e2e/baselines';

export const baselineMeanAbsoluteTolerance = 0.5;
