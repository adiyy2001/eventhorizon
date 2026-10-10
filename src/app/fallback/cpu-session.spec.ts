import { TestBed } from '@angular/core/testing';
import { renderCpuImage } from '../../core/render/cpu-image';
import {
  cpuSupportedSettings,
  defaultSettings,
  mergeSettings,
  type RenderSettings,
} from '../../core/render/settings';
import { poolSize } from '../../core/render/tile-scheduler';
import { browserClock, minimumDisplayInterval } from './cpu-renderer';
import { CPU_SESSION_FACTORY, startCpuSession } from './cpu-session';
import { LoopbackPool, LoopbackPort, ManualClock } from './testing/loopback';
import { CPU_WORKER_PORTS } from './worker-port';

const edge = 24;
const size = { width: edge, height: edge };
const plain = mergeSettings(defaultSettings, { bloomStrength: 0 });

class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

function fakeCanvas() {
  const putImageData = vi.fn<(image: FakeImageData, x: number, y: number) => void>();
  const getContext = vi.fn(() => ({ putImageData }));
  return { canvas: { getContext } as unknown as HTMLCanvasElement, putImageData, getContext };
}

function open(settings: RenderSettings = plain, workerCount = 2) {
  const pool = new LoopbackPool();
  const clock = new ManualClock();
  const { canvas, putImageData, getContext } = fakeCanvas();
  const session = startCpuSession(canvas, edge, settings, {
    ports: pool.create,
    workerCount,
    clock,
  });
  const answerAll = (): void => {
    pool.answerAll();
  };
  return { session, ports: pool.ports, clock, canvas, putImageData, getContext, answerAll };
}

function lastDrawn(putImageData: ReturnType<typeof fakeCanvas>['putImageData']): FakeImageData {
  const call = putImageData.mock.calls.at(-1);
  if (call === undefined) {
    throw new Error('nothing was drawn');
  }
  return call[0];
}

describe('startCpuSession', () => {
  beforeEach(() => {
    vi.stubGlobal('ImageData', FakeImageData);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('asks for a 2D context and fails clearly when the canvas has none', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() =>
      startCpuSession(canvas, edge, plain, {
        ports: () => new LoopbackPort(),
        workerCount: 1,
        clock: new ManualClock(),
      }),
    ).toThrow('2D drawing context');
  });

  it('starts rendering at once and reports the first generation', () => {
    const { session, ports, getContext } = open();
    expect(getContext).toHaveBeenCalledWith('2d');
    expect(ports).toHaveLength(2);
    expect(ports.every((port) => port.posted.length > 0)).toBe(true);
    expect(session.progress()).toMatchObject({ generation: 1, complete: false });
    expect(session.failure()).toBeNull();
  });

  it('draws every frame at the origin and ends with the direct render', () => {
    const { session, answerAll, putImageData } = open();
    answerAll();
    expect(putImageData.mock.calls.every(([, x, y]) => x === 0 && y === 0)).toBe(true);
    const last = lastDrawn(putImageData);
    expect(last.width).toBe(edge);
    expect(last.height).toBe(edge);
    expect(last.data).toEqual(renderCpuImage(plain, size));
    expect(session.progress()).toMatchObject({ complete: true, passesDone: 4, fraction: 1 });
  });

  it('follows new settings with another picture', () => {
    const { session, answerAll, putImageData } = open();
    answerAll();
    const moved = mergeSettings(plain, { view: { inclination: 0.8 } });
    session.setSettings(moved);
    answerAll();
    expect(lastDrawn(putImageData).data).toEqual(renderCpuImage(moved, size));
    expect(session.progress()?.generation).toBe(2);
  });

  it('never asks the workers for overlays only the graphics path can draw', () => {
    const wanted = mergeSettings(plain, { overlays: { photonSphere: true, isco: true } });
    const { session, ports, answerAll, putImageData } = open(wanted);
    answerAll();
    expect(
      ports.flatMap((port) => port.posted).every((request) => !request.settings.overlays.isco),
    ).toBe(true);
    expect(lastDrawn(putImageData).data).toEqual(
      renderCpuImage(cpuSupportedSettings(wanted), size),
    );
    session.setSettings(mergeSettings(wanted, { exposure: 1 }));
    expect(session.progress()?.generation).toBe(1);
  });

  it('has no resolution log', () => {
    expect(open().session.resolutionLog()).toEqual([]);
  });

  it('terminates the workers on destroy', () => {
    const { session, ports } = open();
    session.destroy();
    expect(ports.every((port) => port.terminated)).toBe(true);
  });
});

describe('startCpuSession export', () => {
  beforeEach(() => {
    vi.stubGlobal('ImageData', FakeImageData);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits for the final picture and returns its pixels', async () => {
    const { session, answerAll } = open();
    const pending = session.exportImage({ width: 1024, height: 1024 });
    answerAll();
    const image = await pending;
    expect(image.width).toBe(edge);
    expect(image.height).toBe(edge);
    expect([...image.rgba]).toEqual([...renderCpuImage(plain, size)]);
  });

  it('answers at once when the picture on screen is final and up to date', async () => {
    const { session, answerAll } = open();
    answerAll();
    const image = await session.exportImage({ width: 1024, height: 1024 });
    expect(image.rgba).toHaveLength(edge * edge * 4);
  });

  it('waits for the re-display after a change of exposure', async () => {
    const { session, answerAll, clock } = open();
    answerAll();
    const brighter = mergeSettings(plain, { exposure: 1.5 });
    session.setSettings(brighter);
    const pending = session.exportImage({ width: 1024, height: 1024 });
    clock.advance(minimumDisplayInterval);
    const image = await pending;
    expect([...image.rgba]).toEqual([...renderCpuImage(brighter, size)]);
  });

  it('waits for the new picture after a camera change', async () => {
    const { session, answerAll } = open();
    answerAll();
    const moved = mergeSettings(plain, { view: { azimuth: 0.7 } });
    session.setSettings(moved);
    const pending = session.exportImage({ width: 1024, height: 1024 });
    answerAll();
    expect([...(await pending).rgba]).toEqual([...renderCpuImage(moved, size)]);
  });

  it('rejects when the renderer fails while the export waits', async () => {
    const { session, ports } = open();
    const pending = session.exportImage({ width: 1024, height: 1024 });
    ports[0]?.crash('worker died');
    await expect(pending).rejects.toThrow('worker died');
    expect(session.failure()).toBe('worker died');
    await expect(session.exportImage({ width: 1024, height: 1024 })).rejects.toThrow('worker died');
  });

  it('rejects when the session is destroyed while the export waits', async () => {
    const { session } = open();
    const pending = session.exportImage({ width: 1024, height: 1024 });
    session.destroy();
    await expect(pending).rejects.toThrow('the software renderer stopped');
  });
});

describe('browserClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads a monotonic time and runs a scheduled callback after the delay', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    expect(typeof browserClock.now()).toBe('number');
    browserClock.schedule(callback, 30);
    vi.advanceTimersByTime(29);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('does not run a cancelled callback', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    browserClock.cancel(browserClock.schedule(callback, 30));
    vi.advanceTimersByTime(100);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('CPU_SESSION_FACTORY', () => {
  beforeEach(() => {
    vi.stubGlobal('ImageData', FakeImageData);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a pool sized for this machine on the injected ports', async () => {
    const created: LoopbackPort[] = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CPU_WORKER_PORTS,
          useValue: () => {
            const port = new LoopbackPort();
            created.push(port);
            return port;
          },
        },
      ],
    });
    const factory = TestBed.inject(CPU_SESSION_FACTORY);
    const { canvas } = fakeCanvas();
    const session = await factory(canvas, edge, plain);
    expect(created).toHaveLength(poolSize(navigator.hardwareConcurrency));
    expect(session.progress()?.generation).toBe(1);
    session.destroy();
  });

  it('rejects when the canvas cannot draw', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: CPU_WORKER_PORTS, useValue: () => new LoopbackPort() }],
    });
    const factory = TestBed.inject(CPU_SESSION_FACTORY);
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    await expect(factory(canvas, edge, plain)).rejects.toThrow('2D drawing context');
  });
});
