import { type MutableRgb } from '../color/xyz-srgb';
import { shadowTangentRadius } from '../physics/shadow';
import {
  createOverlayPainter,
  dividerCoverage,
  dividerHandleRadius,
  shadowEdgeCoverage,
} from './cpu-overlays';
import { defaultSettings, mergeSettings } from './settings';
import { viewHalfExtents } from './view';

const size = { width: 128, height: 128 };

describe('shadowEdgeCoverage', () => {
  const halfHeight = viewHalfExtents(defaultSettings.view, size).halfHeight;
  const radius = shadowTangentRadius(defaultSettings.view.distance);
  const radiusPixels = (radius / halfHeight) * (size.height / 2);

  it('is full on the circle and zero well away from it', () => {
    const onCircle = Math.round(size.width / 2 + radiusPixels - 0.5);
    expect(shadowEdgeCoverage(onCircle, 63, size, halfHeight, halfHeight, radius)).toBeGreaterThan(
      0.5,
    );
    expect(shadowEdgeCoverage(63, 63, size, halfHeight, halfHeight, radius)).toBe(0);
    expect(shadowEdgeCoverage(2, 2, size, halfHeight, halfHeight, radius)).toBe(0);
  });
});

describe('dividerCoverage', () => {
  it('covers the line, the handle and nothing at the far side', () => {
    const line = dividerCoverage(64, 10, size, 0.5);
    expect(line.body).toBeGreaterThan(0.5);
    const handle = dividerCoverage(64 + dividerHandleRadius - 4, 64, size, 0.5);
    expect(handle.backdrop).toBeGreaterThan(0.5);
    expect(dividerCoverage(10, 10, size, 0.5)).toEqual({ body: 0, backdrop: 0 });
  });
});

describe('createOverlayPainter', () => {
  function paintedAt(
    settings: ReturnType<typeof mergeSettings>,
    column: number,
    row: number,
    base: MutableRgb = [0, 0, 0],
  ): MutableRgb {
    const color: MutableRgb = [...base];
    createOverlayPainter(settings, size)(color, column, row);
    return color;
  }

  it('leaves every colour alone when no overlay is on', () => {
    for (const [column, row] of [
      [0, 0],
      [64, 64],
      [90, 30],
    ] as const) {
      expect(paintedAt(defaultSettings, column, row, [0.2, 0.4, 0.6])).toEqual([0.2, 0.4, 0.6]);
    }
  });

  it('mixes the shadow edge colour into the ring and nothing outside it', () => {
    const settings = mergeSettings(defaultSettings, { overlays: { shadowEdge: true } });
    const halfHeight = viewHalfExtents(settings.view, size).halfHeight;
    const radiusPixels =
      (shadowTangentRadius(settings.view.distance) / halfHeight) * (size.height / 2);
    const onRing = paintedAt(settings, Math.round(size.width / 2 + radiusPixels - 0.5), 63);
    expect(onRing[1]).toBeGreaterThan(0.5);
    expect(onRing[1]).toBeGreaterThan(onRing[0]);
    expect(paintedAt(settings, 0, 0)).toEqual([0, 0, 0]);
    expect(paintedAt(settings, 64, 64)).toEqual([0, 0, 0]);
  });

  it('draws the divider as a white line near its column only', () => {
    const settings = mergeSettings(defaultSettings, { split: { enabled: true, position: 0.25 } });
    const onLine = paintedAt(settings, 31, 10);
    expect(onLine[0]).toBeGreaterThan(0.9);
    expect(onLine[2]).toBeGreaterThan(0.9);
    expect(paintedAt(settings, 90, 10)).toEqual([0, 0, 0]);
    expect(paintedAt(settings, 31 + dividerHandleRadius + 6, 10)).toEqual([0, 0, 0]);
  });

  it('darkens a bright pixel beside the divider with the outline', () => {
    const settings = mergeSettings(defaultSettings, { split: { enabled: true, position: 0.25 } });
    const beside = paintedAt(settings, 34, 10, [1, 1, 1]);
    expect(beside[0]).toBeLessThan(1);
    expect(beside[0]).toBeGreaterThan(0.2);
  });

  it('paints the divider over the shadow edge when both are on', () => {
    const settings = mergeSettings(defaultSettings, {
      overlays: { shadowEdge: true },
      split: { enabled: true, position: 0.5 },
    });
    const halfHeight = viewHalfExtents(settings.view, size).halfHeight;
    const radiusPixels =
      (shadowTangentRadius(settings.view.distance) / halfHeight) * (size.height / 2);
    const row = 63;
    const column = Math.round(size.width / 2 + radiusPixels - 0.5);
    const edgeOnly = paintedAt(
      mergeSettings(defaultSettings, { overlays: { shadowEdge: true } }),
      column,
      row,
    );
    const both = paintedAt(settings, column, row);
    expect(both).toEqual(edgeOnly);
    const onDivider = paintedAt(settings, 63, Math.round(size.height / 2 + radiusPixels));
    expect(onDivider[0]).toBeGreaterThan(0.9);
  });
});
