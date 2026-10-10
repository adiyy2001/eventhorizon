import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  baselineDirectory,
  baselineMaxAbsoluteTolerance,
  baselineMeanAbsoluteTolerance,
  baselineSpecs,
} from '../bench/baselines.ts';
import { defaultSettings } from '../src/core/render/settings.ts';

describe('baseline specs', () => {
  it('have unique names', () => {
    const names = baselineSpecs.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('cover every physics switch and the overlays with the split', () => {
    const settings = baselineSpecs.map((spec) => spec.settings);
    expect(settings.some((entry) => !entry.view.lensing)).toBe(true);
    expect(settings.some((entry) => !entry.view.doppler)).toBe(true);
    expect(settings.some((entry) => !entry.view.gravitationalRedshift)).toBe(true);
    expect(settings.some((entry) => !entry.view.higherOrderImages)).toBe(true);
    expect(settings.some((entry) => entry.split.enabled && entry.overlays.shadowEdge)).toBe(true);
  });

  it('include the full model at the default settings', () => {
    const full = baselineSpecs.find((spec) => spec.name === 'full-model');
    expect(full?.settings).toEqual(defaultSettings);
  });

  it('have exactly one image on disk each and no strays', () => {
    const expected = baselineSpecs.map((spec) => `${spec.name}.png`).sort();
    const present = readdirSync(baselineDirectory)
      .filter((name) => name.endsWith('.png'))
      .sort();
    expect(present).toEqual(expected);
    for (const name of expected) {
      expect(existsSync(`${baselineDirectory}/${name}`)).toBe(true);
    }
  });

  it('use tolerances that still tell a changed temperature apart', () => {
    expect(baselineMeanAbsoluteTolerance).toBeLessThan(1);
    expect(baselineMaxAbsoluteTolerance).toBeLessThan(128);
  });
});
