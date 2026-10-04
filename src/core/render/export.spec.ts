import { clampExportFrames, clampExportSize, exportLimits } from './export';

const fallback = { width: 512, height: 512 };

describe('clampExportSize', () => {
  it('keeps sizes inside the limits unchanged', () => {
    expect(clampExportSize({ width: 800, height: 600 }, fallback)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('clamps to the minimum and maximum edge', () => {
    expect(clampExportSize({ width: 3, height: 99999 }, fallback)).toEqual({
      width: exportLimits.minEdge,
      height: exportLimits.maxEdge,
    });
  });

  it('rounds fractions and replaces non-finite values with the fallback', () => {
    expect(clampExportSize({ width: 300.6, height: Number.NaN }, fallback)).toEqual({
      width: 301,
      height: 512,
    });
    expect(clampExportSize({ width: Infinity, height: 100 }, fallback).width).toBe(512);
  });
});

describe('clampExportFrames', () => {
  it('uses the default when nothing is asked', () => {
    expect(clampExportFrames(undefined)).toBe(exportLimits.defaultFrames);
    expect(clampExportFrames(Number.NaN)).toBe(exportLimits.defaultFrames);
  });

  it('clamps to at least one and at most the budget', () => {
    expect(clampExportFrames(0)).toBe(1);
    expect(clampExportFrames(-5)).toBe(1);
    expect(clampExportFrames(10_000)).toBe(exportLimits.maxFrames);
    expect(clampExportFrames(12.4)).toBe(12);
  });
});
