export interface ExportSize {
  width: number;
  height: number;
}

export const exportLimits = { minEdge: 64, maxEdge: 2048, maxFrames: 256, defaultFrames: 32 };

function clampEdge(value: number, fallback: number): number {
  const finite = Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(exportLimits.maxEdge, Math.max(exportLimits.minEdge, finite));
}

export function clampExportSize(size: ExportSize, fallback: ExportSize): ExportSize {
  return {
    width: clampEdge(size.width, fallback.width),
    height: clampEdge(size.height, fallback.height),
  };
}

export function clampExportFrames(frames: number | undefined): number {
  if (frames === undefined || !Number.isFinite(frames)) {
    return exportLimits.defaultFrames;
  }
  return Math.min(exportLimits.maxFrames, Math.max(1, Math.round(frames)));
}
