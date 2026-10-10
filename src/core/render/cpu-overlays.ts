import { type MutableRgb } from '../color/xyz-srgb';
import { type ViewportSize } from '../physics/observer';
import { shadowTangentRadius } from '../physics/shadow';
import { type RenderSettings } from './settings';
import { viewHalfExtents } from './view';

export const shadowEdgeColor: readonly [number, number, number] = [0.65, 1, 0.5];
export const dividerColor: readonly [number, number, number] = [1, 1, 1];
export const dividerOutlineColor: readonly [number, number, number] = [0.05, 0.05, 0.08];
export const overlayOpacity = 0.95;
export const dividerHandleRadius = 13;

const outlineOpacity = 0.75;
const dividerMargin = 4;

export type OverlayPainter = (color: MutableRgb, column: number, row: number) => void;

function smoothstep(low: number, high: number, value: number): number {
  const fraction = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return fraction * fraction * (3 - 2 * fraction);
}

export function shadowEdgeCoverage(
  column: number,
  row: number,
  size: ViewportSize,
  halfHeight: number,
  halfWidth: number,
  tangentRadius: number,
): number {
  const tangentX = ((2 * (column + 0.5)) / size.width - 1) * halfWidth;
  const tangentY = (1 - (2 * (row + 0.5)) / size.height) * halfHeight;
  const pixelTangent = (2 * halfHeight) / size.height;
  const distancePixels = Math.abs(Math.hypot(tangentX, tangentY) - tangentRadius) / pixelTangent;
  return 1 - smoothstep(0.6, 1.6, distancePixels);
}

export interface DividerCoverage {
  body: number;
  backdrop: number;
}

export function dividerCoverage(
  column: number,
  row: number,
  size: ViewportSize,
  position: number,
): DividerCoverage {
  const x = column + 0.5;
  const y = row + 0.5;
  const centerX = position * size.width;
  const centerY = 0.5 * size.height;
  const reach = Math.abs(x - centerX);
  const toHandle = Math.hypot(x - centerX, y - centerY);
  const line = 1 - smoothstep(1, 2, reach);
  const outline = 1 - smoothstep(2, 3.2, reach);
  const handleFill = 1 - smoothstep(dividerHandleRadius - 1, dividerHandleRadius, toHandle);
  const handleRing = 1 - smoothstep(1.2, 2.2, Math.abs(toHandle - dividerHandleRadius));
  const arrows = reach > 3 && reach < 8 && Math.abs(y - centerY) < (8 - reach) * 0.9 ? 1 : 0;
  return {
    body: Math.max(line, handleRing, arrows * handleFill),
    backdrop: Math.max(outline, handleFill),
  };
}

function mixInto(
  color: MutableRgb,
  target: readonly [number, number, number],
  amount: number,
): void {
  color[0] += (target[0] - color[0]) * amount;
  color[1] += (target[1] - color[1]) * amount;
  color[2] += (target[2] - color[2]) * amount;
}

export function createOverlayPainter(settings: RenderSettings, size: ViewportSize): OverlayPainter {
  const shadow = settings.overlays.shadowEdge
    ? {
        ...viewHalfExtents(settings.view, size),
        tangentRadius: shadowTangentRadius(settings.view.distance),
      }
    : null;
  const dividerPosition = settings.split.enabled ? settings.split.position : null;
  const dividerCenter = (dividerPosition ?? 0) * size.width;
  const dividerReach = dividerHandleRadius + dividerMargin;

  return (color, column, row) => {
    if (shadow !== null) {
      const coverage = shadowEdgeCoverage(
        column,
        row,
        size,
        shadow.halfHeight,
        shadow.halfWidth,
        shadow.tangentRadius,
      );
      if (coverage > 0) {
        mixInto(color, shadowEdgeColor, overlayOpacity * coverage);
      }
    }
    if (dividerPosition !== null && Math.abs(column + 0.5 - dividerCenter) <= dividerReach) {
      const coverage = dividerCoverage(column, row, size, dividerPosition);
      mixInto(color, dividerOutlineColor, outlineOpacity * coverage.backdrop);
      mixInto(color, dividerColor, coverage.body);
    }
  };
}
