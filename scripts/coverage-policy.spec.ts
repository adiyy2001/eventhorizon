import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config, {
  gpuDeviceBoundFiles,
  testSupportGlobs,
  workerGlueFiles,
} from '../vitest.config.ts';

describe('coverage policy', () => {
  it('lists every excluded file once and each one exists', () => {
    const excluded = [...gpuDeviceBoundFiles, ...workerGlueFiles];
    expect(new Set(excluded).size).toBe(excluded.length);
    for (const file of excluded) {
      expect(existsSync(file), file).toBe(true);
    }
  });

  it('excludes only device bound code, worker glue and test support', () => {
    for (const file of gpuDeviceBoundFiles) {
      expect(file.startsWith('src/gpu/'), file).toBe(true);
    }
    for (const file of workerGlueFiles) {
      expect(file.startsWith('src/workers/'), file).toBe(true);
    }
    expect(testSupportGlobs).toEqual(['src/**/testing/**']);
  });

  it('keeps the exclude list passed to the coverage provider in one place', () => {
    expect(config.test?.coverage?.exclude).toEqual([
      ...gpuDeviceBoundFiles,
      ...workerGlueFiles,
      ...testSupportGlobs,
    ]);
  });

  it('asks for 90 percent of the core and the workers and 80 percent of the rest', () => {
    const thresholds = config.test?.coverage?.thresholds as
      Record<string, { lines: number }> | undefined;
    expect(thresholds?.['src/core/**']?.lines).toBe(90);
    expect(thresholds?.['src/workers/**']?.lines).toBe(90);
    expect(thresholds?.['src/app/**']?.lines).toBe(80);
    expect(thresholds?.['src/gpu/**']?.lines).toBe(80);
  });
});
