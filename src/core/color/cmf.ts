export interface Lobe {
  amplitude: number;
  center: number;
  lowSlope: number;
  highSlope: number;
}

const xLobes: readonly Lobe[] = [
  { amplitude: 0.362, center: 442.0, lowSlope: 0.0624, highSlope: 0.0374 },
  { amplitude: 1.056, center: 599.8, lowSlope: 0.0264, highSlope: 0.0323 },
  { amplitude: -0.065, center: 501.1, lowSlope: 0.049, highSlope: 0.0382 },
];

const yLobes: readonly Lobe[] = [
  { amplitude: 0.821, center: 568.8, lowSlope: 0.0213, highSlope: 0.0247 },
  { amplitude: 0.286, center: 530.9, lowSlope: 0.0613, highSlope: 0.0322 },
];

const zLobes: readonly Lobe[] = [
  { amplitude: 1.217, center: 437.0, lowSlope: 0.0845, highSlope: 0.0278 },
  { amplitude: 0.681, center: 459.0, lowSlope: 0.0385, highSlope: 0.0725 },
];

export const cmfLobes = { x: xLobes, y: yLobes, z: zLobes } as const;

export interface Xyz {
  x: number;
  y: number;
  z: number;
}

export function lobeValue(lobe: Lobe, wavelengthNanometers: number): number {
  const offset = wavelengthNanometers - lobe.center;
  const slope = offset < 0 ? lobe.lowSlope : lobe.highSlope;
  const scaled = offset * slope;
  return lobe.amplitude * Math.exp(-0.5 * scaled * scaled);
}

function sumLobes(lobes: readonly Lobe[], wavelengthNanometers: number): number {
  return lobes.reduce((total, lobe) => total + lobeValue(lobe, wavelengthNanometers), 0);
}

export function colorMatching(wavelengthNanometers: number): Xyz {
  return {
    x: sumLobes(xLobes, wavelengthNanometers),
    y: sumLobes(yLobes, wavelengthNanometers),
    z: sumLobes(zLobes, wavelengthNanometers),
  };
}

export const visibleRange: { low: number; high: number } = { low: 360, high: 830 };
