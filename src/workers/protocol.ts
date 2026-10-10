import { type ViewportSize } from '../core/physics/observer';
import { type RenderSettings, sanitizeSettings } from '../core/render/settings';
import { passSteps, type TileRequest, tileSampleEdge } from '../core/render/tile-scheduler';

export const maxImageEdge = 4096;

export interface RenderTileMessage {
  type: 'render-tile';
  generation: number;
  settings: RenderSettings;
  size: ViewportSize;
  tile: TileRequest;
}

export interface TileDoneMessage {
  type: 'tile-done';
  generation: number;
  tile: TileRequest;
  samples: Float32Array<ArrayBuffer>;
  milliseconds: number;
}

export interface TileFailedMessage {
  type: 'tile-failed';
  generation: number;
  tile: TileRequest;
  detail: string;
}

export interface RequestRejectedMessage {
  type: 'request-rejected';
  detail: string;
}

export type WorkerRequest = RenderTileMessage;
export type WorkerResponse = TileDoneMessage | TileFailedMessage | RequestRejectedMessage;

const largestImage: ViewportSize = { width: maxImageEdge, height: maxImageEdge };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function wholeNumberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isPassStep(value: unknown): value is number {
  return typeof value === 'number' && passSteps.includes(value);
}

function isTransferableFloats(value: unknown): value is Float32Array<ArrayBuffer> {
  return value instanceof Float32Array && value.buffer instanceof ArrayBuffer;
}

export function parseSize(value: unknown): ViewportSize | null {
  if (!isRecord(value)) {
    return null;
  }
  const { width, height } = value;
  if (!wholeNumberIn(width, 1, maxImageEdge) || !wholeNumberIn(height, 1, maxImageEdge)) {
    return null;
  }
  return { width, height };
}

export function parseTile(value: unknown, size: ViewportSize): TileRequest | null {
  if (!isRecord(value)) {
    return null;
  }
  const { pass, step, column, row, columns, rows } = value;
  if (
    !wholeNumberIn(pass, 0, passSteps.length - 1) ||
    !isPassStep(step) ||
    !wholeNumberIn(column, 0, size.width - 1) ||
    !wholeNumberIn(row, 0, size.height - 1) ||
    !wholeNumberIn(columns, 1, Math.min(tileSampleEdge * step, size.width - column)) ||
    !wholeNumberIn(rows, 1, Math.min(tileSampleEdge * step, size.height - row))
  ) {
    return null;
  }
  return { pass, step, column, row, columns, rows };
}

function parseGeneration(value: unknown): number | null {
  return wholeNumberIn(value, 0, Number.MAX_SAFE_INTEGER) ? value : null;
}

export function parseWorkerRequest(data: unknown): WorkerRequest | null {
  if (!isRecord(data) || data['type'] !== 'render-tile') {
    return null;
  }
  const generation = parseGeneration(data['generation']);
  const size = parseSize(data['size']);
  const tile = size === null ? null : parseTile(data['tile'], size);
  if (generation === null || size === null || tile === null) {
    return null;
  }
  return {
    type: 'render-tile',
    generation,
    settings: sanitizeSettings(data['settings']),
    size,
    tile,
  };
}

export function parseWorkerResponse(data: unknown): WorkerResponse | null {
  if (!isRecord(data)) {
    return null;
  }
  const { type, detail, samples, milliseconds } = data;
  if (type === 'request-rejected') {
    return typeof detail === 'string' ? { type, detail } : null;
  }
  const generation = parseGeneration(data['generation']);
  const tile = parseTile(data['tile'], largestImage);
  if (generation === null || tile === null) {
    return null;
  }
  if (type === 'tile-failed' && typeof detail === 'string') {
    return { type, generation, tile, detail };
  }
  if (
    type === 'tile-done' &&
    isTransferableFloats(samples) &&
    typeof milliseconds === 'number' &&
    Number.isFinite(milliseconds) &&
    milliseconds >= 0
  ) {
    return { type, generation, tile, samples, milliseconds };
  }
  return null;
}

export function transferablesOf(response: WorkerResponse): Transferable[] {
  return response.type === 'tile-done' ? [response.samples.buffer] : [];
}
