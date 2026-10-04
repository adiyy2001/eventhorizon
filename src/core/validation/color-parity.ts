import { nebulaRadiance } from '../background/nebula';
import { allStars, STAR_SIGMA, starRadiance } from '../background/stars';
import { hash3, unitFloat } from '../background/hash';
import { texelDirection } from '../background/cube-faces';
import { blackbodyRadiance, type TemperatureLut } from '../color/temperature-lut';
import { displayEncode } from '../color/tonemap';
import { normalize, type Vec3, vec3 } from '../physics/vec3';
import { createMulberry32, uniformBetween } from './prng';

export const COLOR_PARITY_MODES = ['lut', 'tonemap', 'stars', 'nebula', 'cubemap', 'hash'] as const;

export type ColorParityMode = (typeof COLOR_PARITY_MODES)[number];

export const CUBEMAP_PARITY_SIZE = 512;

export interface ColorParitySet {
  mode: ColorParityMode;
  inputs: number[];
  expected: number[];
  inputsAreUint32: boolean;
  componentsCompared: number;
  absoluteTolerance: number;
  relativeTolerance: number;
}

export interface ColorParityReport {
  mode: ColorParityMode;
  samples: number;
  maxAbsoluteError: number;
  maxRelativeError: number;
  violations: number;
  pass: boolean;
}

function randomDirection(random: () => number): Vec3 {
  const height = uniformBetween(random, -1, 1);
  const angle = uniformBetween(random, 0, 2 * Math.PI);
  const radius = Math.sqrt(1 - height * height);
  return vec3(radius * Math.cos(angle), height, radius * Math.sin(angle));
}

function pushVector(target: number[], vector: Vec3, spare = 0): void {
  target.push(vector.x, vector.y, vector.z, spare);
}

function lutSet(lut: TemperatureLut): ColorParitySet {
  const random = createMulberry32(101);
  const temperatures = [500, 1000, 2000, 6500, 100000, 250000];
  for (let index = 0; index < 60; index += 1) {
    temperatures.push(1000 * Math.pow(100, random()));
  }
  const inputs: number[] = [];
  const expected: number[] = [];
  for (const temperature of temperatures) {
    inputs.push(temperature, 0, 0, 0);
    const radiance = blackbodyRadiance(lut, temperature);
    expected.push(radiance[0], radiance[1], radiance[2], 0);
  }
  return {
    mode: 'lut',
    inputs,
    expected,
    inputsAreUint32: false,
    componentsCompared: 3,
    absoluteTolerance: 1e-9,
    relativeTolerance: 1e-3,
  };
}

function tonemapSet(): ColorParitySet {
  const random = createMulberry32(202);
  const inputs: number[] = [];
  const expected: number[] = [];
  for (let index = 0; index < 200; index += 1) {
    const radiance = [0, 0, 0].map(() => Math.pow(10, uniformBetween(random, -4, 3)));
    const exposure = uniformBetween(random, -3, 3);
    inputs.push(radiance[0] ?? 0, radiance[1] ?? 0, radiance[2] ?? 0, exposure);
    const encoded = displayEncode([radiance[0] ?? 0, radiance[1] ?? 0, radiance[2] ?? 0], exposure);
    expected.push(encoded[0], encoded[1], encoded[2], 0);
  }
  return {
    mode: 'tonemap',
    inputs,
    expected,
    inputsAreUint32: false,
    componentsCompared: 3,
    absoluteTolerance: 2e-5,
    relativeTolerance: 2e-5,
  };
}

function starSet(lut: TemperatureLut): ColorParitySet {
  const random = createMulberry32(303);
  const stars = allStars();
  const inputs: number[] = [];
  const expected: number[] = [];
  const centers = stars.filter((_, index) => index % 40 === 0).slice(0, 300);
  for (const star of centers) {
    const probe = normalize(
      vec3(
        star.direction.x + (random() - 0.5) * 4 * STAR_SIGMA,
        star.direction.y + (random() - 0.5) * 4 * STAR_SIGMA,
        star.direction.z + (random() - 0.5) * 4 * STAR_SIGMA,
      ),
    );
    pushVector(inputs, probe);
    const radiance = starRadiance(probe, lut);
    expected.push(radiance[0], radiance[1], radiance[2], 0);
  }
  return {
    mode: 'stars',
    inputs,
    expected,
    inputsAreUint32: false,
    componentsCompared: 3,
    absoluteTolerance: 2e-3,
    relativeTolerance: 4e-3,
  };
}

function nebulaSet(): ColorParitySet {
  const random = createMulberry32(404);
  const inputs: number[] = [];
  const expected: number[] = [];
  for (let index = 0; index < 300; index += 1) {
    const direction = randomDirection(random);
    pushVector(inputs, direction);
    const radiance = nebulaRadiance(direction);
    expected.push(radiance[0], radiance[1], radiance[2], 0);
  }
  return {
    mode: 'nebula',
    inputs,
    expected,
    inputsAreUint32: false,
    componentsCompared: 3,
    absoluteTolerance: 1e-5,
    relativeTolerance: 3e-3,
  };
}

function cubemapSet(): ColorParitySet {
  const random = createMulberry32(505);
  const inputs: number[] = [];
  const expected: number[] = [];
  for (let index = 0; index < 300; index += 1) {
    const face = Math.floor(random() * 6);
    const column = Math.floor(random() * CUBEMAP_PARITY_SIZE);
    const row = Math.floor(random() * CUBEMAP_PARITY_SIZE);
    const direction = texelDirection(face, column, row, CUBEMAP_PARITY_SIZE);
    pushVector(inputs, direction);
    const radiance = nebulaRadiance(direction);
    expected.push(radiance[0], radiance[1], radiance[2], 0);
  }
  return {
    mode: 'cubemap',
    inputs,
    expected,
    inputsAreUint32: false,
    componentsCompared: 3,
    absoluteTolerance: 1e-4,
    relativeTolerance: 6e-3,
  };
}

function hashSet(): ColorParitySet {
  const random = createMulberry32(606);
  const inputs: number[] = [];
  const expected: number[] = [];
  for (let index = 0; index < 500; index += 1) {
    const words = [0, 0, 0, 0].map(() => Math.floor(random() * 4294967296));
    inputs.push(...words);
    const value = unitFloat(hash3(words[0] ?? 0, words[1] ?? 0, words[2] ?? 0, words[3] ?? 0));
    expected.push(value, value, value, value);
  }
  return {
    mode: 'hash',
    inputs,
    expected,
    inputsAreUint32: true,
    componentsCompared: 4,
    absoluteTolerance: 0,
    relativeTolerance: 0,
  };
}

export function buildColorParitySets(lut: TemperatureLut): ColorParitySet[] {
  return [lutSet(lut), tonemapSet(), starSet(lut), nebulaSet(), cubemapSet(), hashSet()];
}

export function compareColorOutputs(
  set: ColorParitySet,
  actual: readonly number[],
): ColorParityReport {
  const samples = set.expected.length / 4;
  let maxAbsolute = 0;
  let maxRelative = 0;
  let violations = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    for (let component = 0; component < set.componentsCompared; component += 1) {
      const expected = set.expected[sample * 4 + component] ?? 0;
      const measured = actual[sample * 4 + component] ?? Number.NaN;
      const error = Math.abs(measured - expected);
      const allowed = set.absoluteTolerance + set.relativeTolerance * Math.abs(expected);
      if (!(error <= allowed)) {
        violations += 1;
      }
      if (Number.isFinite(error)) {
        maxAbsolute = Math.max(maxAbsolute, error);
        if (Math.abs(expected) > 1e-6) {
          maxRelative = Math.max(maxRelative, error / Math.abs(expected));
        }
      } else {
        maxAbsolute = Number.POSITIVE_INFINITY;
      }
    }
  }
  return {
    mode: set.mode,
    samples,
    maxAbsoluteError: maxAbsolute,
    maxRelativeError: maxRelative,
    violations,
    pass: violations === 0 && samples === actual.length / 4,
  };
}
