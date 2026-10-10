import { defaultSettings, mergeSettings } from '../core/render/settings';
import { type TileRequest } from '../core/render/tile-scheduler';
import {
  maxImageEdge,
  parseSize,
  parseTile,
  parseWorkerRequest,
  parseWorkerResponse,
  transferablesOf,
  type TileDoneMessage,
  type WorkerRequest,
} from './protocol';

const size = { width: 64, height: 48 };
const tile: TileRequest = { pass: 1, step: 4, column: 0, row: 0, columns: 64, rows: 48 };

const request: WorkerRequest = {
  type: 'render-tile',
  generation: 3,
  settings: defaultSettings,
  size,
  tile,
};

describe('parseSize', () => {
  it('accepts whole positive sizes up to the limit', () => {
    expect(parseSize({ width: 1, height: 1 })).toEqual({ width: 1, height: 1 });
    expect(parseSize({ width: maxImageEdge, height: 512 })).toEqual({
      width: maxImageEdge,
      height: 512,
    });
  });

  it.each([
    null,
    'size',
    {},
    { width: 0, height: 10 },
    { width: 10, height: -1 },
    { width: 10.5, height: 10 },
    { width: maxImageEdge + 1, height: 10 },
    { width: '10', height: 10 },
    { width: Number.NaN, height: 10 },
  ])('rejects %j', (value) => {
    expect(parseSize(value)).toBeNull();
  });
});

describe('parseTile', () => {
  it('accepts a tile inside the image', () => {
    expect(parseTile(tile, size)).toEqual(tile);
  });

  it('keeps only the tile fields', () => {
    expect(parseTile({ ...tile, extra: 1 }, size)).toEqual(tile);
  });

  it.each([
    ['a step outside the plan', { step: 3 }],
    ['a negative pass', { pass: -1 }],
    ['a pass beyond the plan', { pass: 4 }],
    ['a column outside the image', { column: 64 }],
    ['a row outside the image', { row: 48 }],
    ['a tile that leaves the image', { column: 32, columns: 64 }],
    ['an empty tile', { columns: 0 }],
    ['a tile wider than the sample edge allows', { step: 1, columns: 17 }],
    ['a fractional column', { column: 0.5 }],
  ])('rejects %s', (_, change) => {
    expect(parseTile({ ...tile, ...change }, size)).toBeNull();
  });

  it('rejects values that are not objects', () => {
    expect(parseTile(null, size)).toBeNull();
    expect(parseTile(7, size)).toBeNull();
  });
});

describe('parseWorkerRequest', () => {
  it('accepts a well formed render request', () => {
    expect(parseWorkerRequest(request)).toEqual(request);
  });

  it('sanitizes the settings instead of trusting them', () => {
    const parsed = parseWorkerRequest({
      ...request,
      settings: { view: { distance: 1e9, inclination: 'sideways' }, exposure: 99 },
    });
    expect(parsed?.settings.view.distance).toBe(200);
    expect(parsed?.settings.view.inclination).toBe(defaultSettings.view.inclination);
    expect(parsed?.settings.exposure).toBe(4);
  });

  it('keeps the settings that are valid', () => {
    const settings = mergeSettings(defaultSettings, {
      view: { doppler: false },
      split: { enabled: true, position: 0.3 },
    });
    expect(parseWorkerRequest({ ...request, settings })?.settings).toEqual(settings);
  });

  it.each([
    ['another message type', { ...request, type: 'render-frame' }],
    ['a missing generation', { ...request, generation: undefined }],
    ['a negative generation', { ...request, generation: -2 }],
    ['a fractional generation', { ...request, generation: 1.5 }],
    ['a bad size', { ...request, size: { width: 0, height: 8 } }],
    ['a tile outside the size', { ...request, tile: { ...tile, column: 99 } }],
    ['no tile', { ...request, tile: undefined }],
    ['a string', 'render-tile'],
    ['null', null],
  ])('rejects %s', (_, data) => {
    expect(parseWorkerRequest(data)).toBeNull();
  });
});

describe('parseWorkerResponse', () => {
  const done: TileDoneMessage = {
    type: 'tile-done',
    generation: 3,
    tile,
    samples: new Float32Array(12),
    milliseconds: 4.5,
  };

  it('accepts a finished tile with its samples', () => {
    const parsed = parseWorkerResponse(done);
    expect(parsed).toEqual(done);
  });

  it('accepts a failed tile and a rejected request', () => {
    const failed = { type: 'tile-failed', generation: 2, tile, detail: 'boom' };
    expect(parseWorkerResponse(failed)).toEqual(failed);
    const rejected = { type: 'request-rejected', detail: 'bad' };
    expect(parseWorkerResponse(rejected)).toEqual(rejected);
  });

  it.each([
    ['samples that are not floats', { ...done, samples: new Uint8Array(12) }],
    ['samples as a plain array', { ...done, samples: [1, 2, 3] }],
    ['a negative duration', { ...done, milliseconds: -1 }],
    ['an infinite duration', { ...done, milliseconds: Infinity }],
    ['a missing duration', { ...done, milliseconds: undefined }],
    ['a bad generation', { ...done, generation: 'x' }],
    ['a bad tile', { ...done, tile: { ...tile, step: 5 } }],
    ['a failure without detail', { type: 'tile-failed', generation: 1, tile }],
    ['a rejection without detail', { type: 'request-rejected' }],
    ['another type', { ...done, type: 'tile-started' }],
    ['null', null],
    ['text', 'tile-done'],
  ])('rejects %s', (_, data) => {
    expect(parseWorkerResponse(data)).toBeNull();
  });
});

describe('transferablesOf', () => {
  it('lists the sample buffer of a finished tile', () => {
    const samples = new Float32Array(8);
    const list = transferablesOf({
      type: 'tile-done',
      generation: 1,
      tile,
      samples,
      milliseconds: 1,
    });
    expect(list).toEqual([samples.buffer]);
  });

  it('lists nothing for the other responses', () => {
    expect(transferablesOf({ type: 'tile-failed', generation: 1, tile, detail: 'x' })).toEqual([]);
    expect(transferablesOf({ type: 'request-rejected', detail: 'x' })).toEqual([]);
  });
});
