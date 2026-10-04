import blitSource from './shaders/blit.wgsl';
import constantsSource from './shaders/constants.wgsl';
import diskSource from './shaders/disk.wgsl';
import geodesicSource from './shaders/geodesic.wgsl';
import imageSource from './shaders/image.wgsl';
import observerSource from './shaders/observer.wgsl';
import paritySource from './shaders/parity.wgsl';
import traceSource from './shaders/trace.wgsl';

export const shaderSources = {
  blit: blitSource,
  constants: constantsSource,
  disk: diskSource,
  geodesic: geodesicSource,
  image: imageSource,
  observer: observerSource,
  parity: paritySource,
  trace: traceSource,
} as const;

export type ShaderModuleName = keyof typeof shaderSources;

export const tracerModules: readonly ShaderModuleName[] = [
  'constants',
  'geodesic',
  'observer',
  'disk',
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

export const imageShader = composeShader([...tracerModules, 'image']);
export const parityShader = composeShader([...tracerModules, 'parity']);
export const blitShader = composeShader(['blit']);

export function declaredNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(
    /^\s*(?:fn|struct|const|override)\s+(\w+)|^\s*@[^\n]*\bvar(?:<[^>]*>)?\s+(\w+)/gm,
  )) {
    const name = match[1] ?? match[2];
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
