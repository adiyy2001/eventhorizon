import accumulateSource from './shaders/accumulate.wgsl';
import bakeSource from './shaders/bake.wgsl';
import bloomSource from './shaders/bloom.wgsl';
import colorParitySource from './shaders/colorparity.wgsl';
import constantsSource from './shaders/constants.wgsl';
import cubeFacesSource from './shaders/cubefaces.wgsl';
import diskSource from './shaders/disk.wgsl';
import fullscreenSource from './shaders/fullscreen.wgsl';
import geodesicSource from './shaders/geodesic.wgsl';
import hashSource from './shaders/hash.wgsl';
import imageSource from './shaders/image.wgsl';
import nebulaSource from './shaders/nebula.wgsl';
import noiseSource from './shaders/noise.wgsl';
import observerSource from './shaders/observer.wgsl';
import overlaySource from './shaders/overlay.wgsl';
import paritySource from './shaders/parity.wgsl';
import presentSource from './shaders/present.wgsl';
import skySource from './shaders/sky.wgsl';
import starsSource from './shaders/stars.wgsl';
import tonemapSource from './shaders/tonemap.wgsl';
import traceSource from './shaders/trace.wgsl';

export const shaderSources = {
  accumulate: accumulateSource,
  bake: bakeSource,
  bloom: bloomSource,
  colorparity: colorParitySource,
  constants: constantsSource,
  cubefaces: cubeFacesSource,
  disk: diskSource,
  fullscreen: fullscreenSource,
  geodesic: geodesicSource,
  hash: hashSource,
  image: imageSource,
  nebula: nebulaSource,
  noise: noiseSource,
  observer: observerSource,
  overlay: overlaySource,
  parity: paritySource,
  present: presentSource,
  sky: skySource,
  stars: starsSource,
  tonemap: tonemapSource,
  trace: traceSource,
} as const;

export type ShaderModuleName = keyof typeof shaderSources;

export const tracerModules: readonly ShaderModuleName[] = [
  'constants',
  'geodesic',
  'observer',
  'disk',
  'overlay',
  'trace',
];

export function composeShader(names: readonly ShaderModuleName[]): string {
  const seen = new Set<ShaderModuleName>();
  for (const name of names) {
    if (seen.has(name)) {
      throw new RangeError(`shader module ${name} listed twice`);
    }
    seen.add(name);
  }
  return names.map((name) => shaderSources[name]).join('\n');
}

export const imageShader = composeShader([
  ...tracerModules,
  'hash',
  'cubefaces',
  'sky',
  'stars',
  'image',
]);
export const parityShader = composeShader([...tracerModules, 'parity']);
export const bakeShader = composeShader(['hash', 'noise', 'cubefaces', 'nebula', 'bake']);
export const accumulateShader = composeShader(['accumulate']);
export const bloomShader = composeShader(['fullscreen', 'bloom']);
export const presentShader = composeShader(['fullscreen', 'hash', 'tonemap', 'present']);
export const colorParityShader = composeShader([
  'hash',
  'noise',
  'cubefaces',
  'nebula',
  'sky',
  'stars',
  'tonemap',
  'colorparity',
]);

export function declaredNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(
    /^\s*(?:fn|struct|const|override)\s+(\w+)|^\s*@[^\n]*\bvar(?:<[^>]*>)?\s+(\w+)|^var(?:<[^>]*>)?\s+(\w+)/gm,
  )) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name !== undefined) {
      names.push(name);
    }
  }
  return names;
}

export function duplicateDeclarations(source: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const name of declaredNames(source)) {
    if (seen.has(name)) {
      duplicates.add(name);
    }
    seen.add(name);
  }
  return [...duplicates];
}

export const compiledShaders = {
  image: imageShader,
  parity: parityShader,
  bake: bakeShader,
  accumulate: accumulateShader,
  bloom: bloomShader,
  present: presentShader,
  colorparity: colorParityShader,
} as const;
