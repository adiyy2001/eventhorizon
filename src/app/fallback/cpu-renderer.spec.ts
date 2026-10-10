import { renderCpuImage } from '../../core/render/cpu-image';
import { defaultSettings, mergeSettings, type RenderSettings } from '../../core/render/settings';
import { type WorkerResponse } from '../../workers/protocol';
import { type RenderProgress } from '../viewport/render-session';
import {
  CpuRenderer,
  type CpuFrame,
  displayDelay,
  minimumDisplayInterval,
  tilesInFlightPerWorker,
} from './cpu-renderer';
import { LoopbackPool, ManualClock } from './testing/loopback';

const size = { width: 136, height: 16 };
const tilesPerPass = [2, 3, 5, 9];

interface Harness {
  renderer: CpuRenderer;
  pool: LoopbackPool;
  clock: ManualClock;
  frames: CpuFrame[];
  progress: RenderProgress[];
  failures: string[];
}

function harness(workerCount: number): Harness {
  const pool = new LoopbackPool();
  const clock = new ManualClock();
  const frames: CpuFrame[] = [];
  const progress: RenderProgress[] = [];
  const failures: string[] = [];
  const renderer = new CpuRenderer({
    ports: pool.create,
    workerCount,
    size,
    clock,
    listener: {
      frame: (frame) => frames.push(frame),
      progress: (next) => progress.push(next),
      failure: (detail) => failures.push(detail),
    },
  });
  return { renderer, pool, clock, frames, progress, failures };
}

function lastOf<T>(values: readonly T[]): T {
  const value = values.at(-1);
  if (value === undefined) {
    throw new Error('nothing recorded');
  }
  return value;
}

const plain: RenderSettings = mergeSettings(defaultSettings, { bloomStrength: 0 });

describe('displayDelay', () => {
  it('does not wait before the first display', () => {
    expect(displayDelay(0, Number.NEGATIVE_INFINITY, 0)).toBe(0);
  });

  it('waits out the minimum interval after a quick display', () => {
    expect(displayDelay(110, 100, 3)).toBe(minimumDisplayInterval - 10);
  });

  it('waits twice the cost of a slow display', () => {
    expect(displayDelay(300, 200, 90)).toBe(180 - 100);
  });

  it('never returns a negative delay', () => {
    expect(displayDelay(5000, 100, 90)).toBe(0);
  });
});

describe('CpuRenderer dispatch', () => {
  it('opens one port per worker and posts nothing before settings arrive', () => {
    const { pool } = harness(4);
    expect(pool.ports).toHaveLength(4);
    expect(pool.queued).toBe(0);
  });

  it('hands out tiles round robin up to the in flight limit, first pass first', () => {
    const { renderer, pool } = harness(3);
    renderer.setSettings(plain);
    expect(pool.ports.map((port) => port.queue.length)).toEqual([
      tilesInFlightPerWorker,
      tilesInFlightPerWorker,
      tilesInFlightPerWorker,
    ]);
    const requests = pool.ports.flatMap((port) => port.queue);
    expect(requests.every((request) => request.generation === 1)).toBe(true);
    expect(requests.every((request) => request.size === size)).toBe(true);
    expect(requests.every((request) => request.settings === plain)).toBe(true);
    const order = pool.ports.map((port) => port.queue[0]?.tile.pass);
    expect(order).toEqual([0, 0, 1]);
  });

  it('posts the next tile when a response frees a slot', () => {
    const { renderer, pool } = harness(1);
    renderer.setSettings(plain);
    const port = pool.ports[0];
    expect(port?.posted).toHaveLength(tilesInFlightPerWorker);
    port?.answerNext();
    expect(port?.posted).toHaveLength(tilesInFlightPerWorker + 1);
    expect(port?.queue).toHaveLength(tilesInFlightPerWorker);
  });

  it('works through every tile of every pass exactly once', () => {
    const { renderer, pool } = harness(3);
    renderer.setSettings(plain);
    pool.answerAll();
    const tiles = pool.ports.flatMap((port) => port.posted.map((request) => request.tile));
    expect(new Set(tiles.map((tile) => JSON.stringify(tile))).size).toBe(tiles.length);
    expect(
      tilesPerPass.map((_, pass) => tiles.filter((tile) => tile.pass === pass).length),
    ).toEqual(tilesPerPass);
  });
});

describe('CpuRenderer progress and frames', () => {
  it('reports the start of a generation before any tile is back', () => {
    const { renderer, progress } = harness(2);
    renderer.setSettings(plain);
    expect(progress).toEqual([
      {
        generation: 1,
        passesDone: 0,
        passesTotal: 4,
        fraction: 0,
        complete: false,
        firstImageMilliseconds: null,
        fullImageMilliseconds: null,
      },
    ]);
  });

  it('ends with a final frame equal to a direct render', () => {
    const { renderer, pool, frames, progress, failures } = harness(3);
    const settings = mergeSettings(defaultSettings, {
      overlays: { shadowEdge: true },
      split: { enabled: true, position: 0.4 },
    });
    renderer.setSettings(settings);
    pool.answerAll();
    const last = lastOf(frames);
    expect(last.quality).toBe('final');
    expect(last.generation).toBe(1);
    expect(last.size).toBe(size);
    expect(last.pixels).toEqual(renderCpuImage(settings, size));
    expect(lastOf(progress)).toMatchObject({ complete: true, fraction: 1, passesDone: 4 });
    expect(renderer.settled).toBe(true);
    expect(failures).toEqual([]);
  });

  it('shows a preview when each early pass completes and the final image once', () => {
    const { renderer, pool, frames } = harness(2);
    renderer.setSettings(plain);
    pool.answerAll();
    expect(frames.map((frame) => frame.quality)).toEqual([
      'preview',
      'preview',
      'preview',
      'final',
    ]);
  });

  it('records when the first image and the full image were shown', () => {
    const { renderer, pool, clock, progress } = harness(1);
    renderer.setSettings(plain);
    const port = pool.ports[0];
    let answered = 0;
    while (port !== undefined && port.queue.length > 0) {
      clock.time += 5;
      port.answerNext();
      answered += 1;
    }
    const final = lastOf(progress);
    expect(final.complete).toBe(true);
    expect(final.firstImageMilliseconds).toBe(2 * 5);
    expect(final.fullImageMilliseconds).toBe(answered * 5);
  });

  it('counts the fraction of finished tiles', () => {
    const { renderer, pool, progress } = harness(2);
    renderer.setSettings(plain);
    pool.answerOnePerPort();
    const middle = lastOf(progress);
    expect(middle.fraction).toBeCloseTo(2 / 19, 10);
    expect(middle.passesDone).toBe(1);
    expect(middle.complete).toBe(false);
  });
});

describe('CpuRenderer display throttling', () => {
  it('shows the first picture while the first pass is still filling in', () => {
    const { renderer, pool, clock, frames } = harness(1);
    renderer.setSettings(plain);
    pool.ports[0]?.answerNext();
    expect(frames).toHaveLength(0);
    expect(clock.pendingTimers).toBe(1);
    clock.advance(0);
    expect(frames).toHaveLength(1);
    expect(lastOf(frames)).toMatchObject({ generation: 1, quality: 'preview' });
  });

  it('shows one preview for a burst of tiles inside one pass after the minimum interval', () => {
    const { renderer, pool, clock, frames } = harness(1);
    renderer.setSettings(plain);
    const port = pool.ports[0];
    port?.answerNext();
    port?.answerNext();
    expect(frames).toHaveLength(1);
    port?.answerNext();
    port?.answerNext();
    expect(frames).toHaveLength(1);
    expect(clock.pendingTimers).toBe(1);
    clock.advance(minimumDisplayInterval - 1);
    expect(frames).toHaveLength(1);
    clock.advance(1);
    expect(frames).toHaveLength(2);
    expect(clock.pendingTimers).toBe(0);
  });

  it('leaves no timer behind once the final image is shown', () => {
    const { renderer, pool, clock, frames } = harness(2);
    renderer.setSettings(plain);
    pool.answerAll();
    const count = frames.length;
    clock.advance(10_000);
    expect(frames).toHaveLength(count);
    expect(clock.pendingTimers).toBe(0);
  });
});

describe('CpuRenderer settings changes', () => {
  it('ignores identical settings', () => {
    const { renderer, pool, progress } = harness(2);
    renderer.setSettings(plain);
    const posted = pool.postedCount;
    renderer.setSettings(mergeSettings(plain, {}));
    expect(pool.postedCount).toBe(posted);
    expect(progress).toHaveLength(1);
  });

  it('starts a new generation for a camera change and drops answers to the old one', () => {
    const { renderer, pool, frames, progress } = harness(2);
    renderer.setSettings(plain);
    pool.answerOnePerPort();
    const moved = mergeSettings(plain, { view: { inclination: 0.9 } });
    renderer.setSettings(moved);
    expect(lastOf(progress).generation).toBe(2);
    const shownBefore = frames.length;
    pool.answerAll();
    expect(frames.slice(shownBefore).every((frame) => frame.generation === 2)).toBe(true);
    expect(lastOf(frames).quality).toBe('final');
    expect(lastOf(frames).pixels).toEqual(renderCpuImage(moved, size));
    expect(lastOf(progress)).toMatchObject({ generation: 2, complete: true });
  });

  it('gives new work to a worker as soon as its stale answers free the slots', () => {
    const { renderer, pool } = harness(2);
    renderer.setSettings(plain);
    const before = pool.postedCount;
    renderer.setSettings(mergeSettings(plain, { view: { distance: 40 } }));
    expect(pool.postedCount).toBe(before);
    pool.ports[0]?.answerNext();
    expect(pool.ports[0]?.posted.at(-1)?.generation).toBe(2);
  });

  it('never marks the old generation complete once it was replaced', () => {
    const { renderer, pool, progress } = harness(3);
    renderer.setSettings(plain);
    renderer.setSettings(mergeSettings(plain, { view: { azimuth: 1 } }));
    pool.answerAll();
    expect(progress.filter((entry) => entry.generation === 1 && entry.complete)).toEqual([]);
    expect(progress.some((entry) => entry.generation === 2 && entry.complete)).toBe(true);
  });

  it('keeps the previous picture until the first pass of the new generation is done', () => {
    const { renderer, pool, clock, frames, progress } = harness(1);
    renderer.setSettings(plain);
    pool.answerAll();
    const shown = frames.length;
    renderer.setSettings(mergeSettings(plain, { view: { inclination: 1.2 } }));
    const port = pool.ports[0];
    port?.answerNext();
    expect(frames).toHaveLength(shown);
    expect(clock.pendingTimers).toBe(0);
    port?.answerNext();
    expect(frames).toHaveLength(shown + 1);
    expect(frames[shown]).toMatchObject({ generation: 2, quality: 'preview' });
    expect(lastOf(progress)).toMatchObject({ generation: 2, passesDone: 1 });
  });

  it('shows another exposure without tracing again', () => {
    const { renderer, pool, clock, frames, progress } = harness(3);
    renderer.setSettings(plain);
    pool.answerAll();
    const posted = pool.postedCount;
    const shown = frames.length;
    const brighter = mergeSettings(plain, { exposure: 1.5 });
    renderer.setSettings(brighter);
    expect(renderer.settled).toBe(false);
    clock.advance(minimumDisplayInterval);
    expect(pool.postedCount).toBe(posted);
    expect(frames).toHaveLength(shown + 1);
    expect(lastOf(frames)).toMatchObject({ generation: 1, quality: 'final' });
    expect(lastOf(frames).pixels).toEqual(renderCpuImage(brighter, size));
    expect(renderer.settled).toBe(true);
    expect(progress.every((entry) => entry.generation === 1)).toBe(true);
  });

  it('keeps the timings of a generation when only the exposure changes', () => {
    const { renderer, pool, clock, progress } = harness(2);
    renderer.setSettings(plain);
    clock.time = 7;
    pool.answerAll();
    const before = lastOf(progress);
    clock.time = 500;
    renderer.setSettings(mergeSettings(plain, { exposure: -1 }));
    clock.advance(minimumDisplayInterval);
    const after = lastOf(progress);
    expect(after.firstImageMilliseconds).toBe(before.firstImageMilliseconds);
    expect(after.fullImageMilliseconds).toBe(before.fullImageMilliseconds);
  });

  it('draws the shadow edge when the finished image is shown again', () => {
    const { renderer, pool, clock, frames } = harness(3);
    renderer.setSettings(plain);
    pool.answerAll();
    const outlined = mergeSettings(plain, { overlays: { shadowEdge: true } });
    renderer.setSettings(outlined);
    clock.advance(minimumDisplayInterval);
    expect(lastOf(frames).pixels).toEqual(renderCpuImage(outlined, size));
  });

  it('does not show a new exposure while the replaced picture is held back', () => {
    const { renderer, pool, clock, frames } = harness(2);
    renderer.setSettings(plain);
    pool.answerAll();
    renderer.setSettings(mergeSettings(plain, { view: { distance: 33 } }));
    const shown = frames.length;
    renderer.setSettings(mergeSettings(plain, { view: { distance: 33 }, exposure: 1 }));
    clock.advance(minimumDisplayInterval * 4);
    expect(frames).toHaveLength(shown);
  });
});

describe('CpuRenderer failures', () => {
  it('reports a failed tile once, stops the workers and ignores later settings', () => {
    const { renderer, pool, failures, frames } = harness(2);
    renderer.setSettings(plain);
    const request = pool.ports[0]?.queue[0];
    if (request === undefined) {
      throw new Error('no request');
    }
    const failed = (detail: string): WorkerResponse => ({
      type: 'tile-failed',
      generation: 1,
      tile: request.tile,
      detail,
    });
    pool.ports[0]?.answerWith(failed('boom'));
    pool.ports[1]?.answerWith(failed('again'));
    expect(failures).toEqual(['boom']);
    expect(pool.ports.every((port) => port.terminated)).toBe(true);
    const posted = pool.postedCount;
    renderer.setSettings(mergeSettings(plain, { exposure: 2 }));
    expect(pool.postedCount).toBe(posted);
    expect(frames).toEqual([]);
    expect(renderer.settled).toBe(false);
  });

  it('reports a rejected request as a failure', () => {
    const { renderer, pool, failures } = harness(1);
    renderer.setSettings(plain);
    pool.ports[0]?.answerWith({ type: 'request-rejected', detail: 'not valid' });
    expect(failures).toEqual(['not valid']);
  });

  it('reports a crashed worker as a failure', () => {
    const { renderer, pool, failures } = harness(2);
    renderer.setSettings(plain);
    pool.ports[1]?.crash('out of memory');
    expect(failures).toEqual(['out of memory']);
    expect(pool.ports.every((port) => port.terminated)).toBe(true);
  });

  it('reports a sample buffer of the wrong length as a failure', () => {
    const { renderer, pool, failures } = harness(1);
    renderer.setSettings(plain);
    const request = pool.ports[0]?.queue[0];
    if (request === undefined) {
      throw new Error('no request');
    }
    pool.ports[0]?.answerWith({
      type: 'tile-done',
      generation: 1,
      tile: request.tile,
      samples: new Float32Array(2),
      milliseconds: 1,
    });
    expect(failures).toEqual(['the sample buffer does not match the tile']);
  });

  it('terminates every worker on destroy and ignores answers that arrive later', () => {
    const { renderer, pool, frames, failures } = harness(2);
    renderer.setSettings(plain);
    renderer.destroy();
    expect(pool.ports.every((port) => port.terminated)).toBe(true);
    pool.ports[0]?.answerNext();
    pool.ports[1]?.crash('late');
    expect(frames).toEqual([]);
    expect(failures).toEqual([]);
    expect(renderer.settled).toBe(false);
  });
});
