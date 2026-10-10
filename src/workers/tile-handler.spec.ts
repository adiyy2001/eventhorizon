import { createCpuShader } from '../core/render/cpu-frame';
import { renderTileSamples } from '../core/render/cpu-tile';
import { defaultSettings, mergeSettings, type RenderSettings } from '../core/render/settings';
import { planPasses, tilesForPass, type TileRequest } from '../core/render/tile-scheduler';
import { type ViewDescription } from '../core/render/view';
import { type WorkerRequest, type WorkerResponse } from './protocol';
import { TileHandler } from './tile-handler';

const size = { width: 40, height: 24 };

function firstTile(passIndex: number): TileRequest {
  const pass = planPasses(size)[passIndex];
  const tile = pass === undefined ? undefined : tilesForPass(size, pass)[0];
  if (tile === undefined) {
    throw new Error('no tile');
  }
  return tile;
}

function requestFor(tile: TileRequest, generation = 1, settings = defaultSettings): WorkerRequest {
  return { type: 'render-tile', generation, settings, size, tile };
}

function samplesOf(response: WorkerResponse): Float32Array {
  if (response.type !== 'tile-done') {
    throw new Error(`expected a finished tile, got ${response.type}`);
  }
  return response.samples;
}

function steppingClock(): () => number {
  let time = 100;
  return () => {
    time += 2.5;
    return time;
  };
}

describe('TileHandler', () => {
  it('renders the samples of the requested tile and echoes its identity', () => {
    const handler = new TileHandler(steppingClock());
    const tile = firstTile(1);
    const response = handler.handle(requestFor(tile, 9));
    expect(response.type).toBe('tile-done');
    if (response.type !== 'tile-done') {
      return;
    }
    expect(response.generation).toBe(9);
    expect(response.tile).toEqual(tile);
    expect(response.samples).toEqual(
      renderTileSamples(createCpuShader(defaultSettings, size), tile),
    );
  });

  it('reports how long the tile took from its clock', () => {
    const handler = new TileHandler(steppingClock());
    const response = handler.handle(requestFor(firstTile(0)));
    expect(response.type === 'tile-done' && response.milliseconds).toBe(2.5);
  });

  it('keeps its shader while the render key stays the same', () => {
    const created: RenderSettings[] = [];
    const handler = new TileHandler(steppingClock(), (settings, shaderSize) => {
      created.push(settings);
      return createCpuShader(settings, shaderSize);
    });
    const tile = firstTile(0);
    handler.handle(requestFor(tile, 1));
    handler.handle(requestFor(tile, 2, mergeSettings(defaultSettings, { exposure: 3 })));
    handler.handle(requestFor(tile, 3, mergeSettings(defaultSettings, { bloomStrength: 0.3 })));
    handler.handle(
      requestFor(tile, 4, mergeSettings(defaultSettings, { overlays: { shadowEdge: true } })),
    );
    expect(created).toHaveLength(1);
  });

  it('swaps its shader when the view or the split changes', () => {
    const created: RenderSettings[] = [];
    const handler = new TileHandler(steppingClock(), (settings, shaderSize) => {
      created.push(settings);
      return createCpuShader(settings, shaderSize);
    });
    const tile = firstTile(0);
    const moved = mergeSettings(defaultSettings, { view: { inclination: 1.2 } });
    const split = mergeSettings(moved, { split: { enabled: true, position: 0.4 } });
    const first = samplesOf(handler.handle(requestFor(tile, 1)));
    const second = samplesOf(handler.handle(requestFor(tile, 2, moved)));
    samplesOf(handler.handle(requestFor(tile, 3, split)));
    expect(created).toHaveLength(3);
    expect(second).toEqual(renderTileSamples(createCpuShader(moved, size), tile));
    expect(second).not.toEqual(first);
  });

  it('answers a failure with the identity of the tile instead of throwing', () => {
    const handler = new TileHandler(steppingClock());
    const tile = firstTile(0);
    const poisoned = {
      ...defaultSettings,
      get view(): ViewDescription {
        throw new Error('settings exploded');
      },
    };
    expect(handler.handle(requestFor(tile, 5, poisoned))).toEqual({
      type: 'tile-failed',
      generation: 5,
      tile,
      detail: 'settings exploded',
    });
    expect(handler.handle(requestFor(tile)).type).toBe('tile-done');
  });

  it('describes a thrown value that is not an error', () => {
    const reason: unknown = 'plain text';
    const poisoned = {
      ...defaultSettings,
      get view(): ViewDescription {
        throw reason;
      },
    };
    const response = new TileHandler(steppingClock()).handle(requestFor(firstTile(0), 1, poisoned));
    expect(response.type === 'tile-failed' && response.detail).toBe('plain text');
  });

  it('turns a malformed message into a rejection', () => {
    const handler = new TileHandler(steppingClock());
    expect(handler.receive({ type: 'nonsense' })).toEqual({
      type: 'request-rejected',
      detail: 'the message is not a valid render request',
    });
  });

  it('renders a request that arrives as raw message data', () => {
    const handler = new TileHandler(steppingClock());
    const response = handler.receive(requestFor(firstTile(2), 4));
    expect(response.type).toBe('tile-done');
  });

  it('can be warmed up before the first request', () => {
    expect(() => {
      new TileHandler(steppingClock()).warmUp();
    }).not.toThrow();
  });
});
