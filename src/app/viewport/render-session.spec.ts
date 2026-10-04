import { defaultSettings, mergeSettings } from '../../core/render/settings';
import { type DeviceResult } from '../../gpu/device';
import { type FrameScheduler } from '../../gpu/render-loop';
import { type SkyResources } from '../../gpu/sky-resources';
import {
  startRenderSession,
  type SessionDependencies,
  type SessionRenderer,
} from './render-session';

function fakeDevice() {
  return {
    queue: { onSubmittedWorkDone: vi.fn(() => Promise.resolve()) },
    destroy: vi.fn(),
  };
}

function ready(device: ReturnType<typeof fakeDevice>): DeviceResult {
  return {
    status: 'ready',
    device: device as unknown as GPUDevice,
    adapter: { vendor: '', architecture: '', device: '', description: '' },
    timestampQuery: false,
  };
}

function fakeRenderer(): SessionRenderer & { render: ReturnType<typeof vi.fn> } {
  return {
    sky: {} as SkyResources,
    render: vi.fn(() => ({ frameIndex: 0, reset: true, internal: { width: 8, height: 8 } })),
    accumulatedFrames: 0,
    framesInFlight: 0,
    gpuMeasurement: null,
    destroy: vi.fn(),
  };
}

class ManualScheduler implements FrameScheduler {
  callback: ((time: number) => void) | null = null;
  cancel = vi.fn(() => {
    this.callback = null;
  });

  request(callback: (time: number) => void): number {
    this.callback = callback;
    return 1;
  }

  tick(time: number): void {
    const callback = this.callback;
    this.callback = null;
    callback?.(time);
  }
}

function dependencies(
  device: ReturnType<typeof fakeDevice>,
  renderer: SessionRenderer,
  scheduler: ManualScheduler,
  overrides: Partial<SessionDependencies> = {},
): SessionDependencies {
  return {
    acquire: () => Promise.resolve(ready(device)),
    createRenderer: () => Promise.resolve(renderer),
    renderStill: () => Promise.resolve({ width: 4, height: 4, rgba: new Uint8Array(64) }),
    scheduler,
    ...overrides,
  };
}

describe('startRenderSession', () => {
  it('renders the first frame, waits for the queue and tears everything down on destroy', async () => {
    const device = fakeDevice();
    const renderer = fakeRenderer();
    const scheduler = new ManualScheduler();
    const createRenderer = vi.fn<SessionDependencies['createRenderer']>(() =>
      Promise.resolve(renderer),
    );
    const canvas = {} as HTMLCanvasElement;
    const session = await startRenderSession(
      canvas,
      256,
      defaultSettings,
      dependencies(device, renderer, scheduler, { createRenderer }),
    );
    expect(createRenderer).toHaveBeenCalledWith(device, { width: 256, height: 256 }, canvas);
    expect(renderer.render).toHaveBeenCalledWith(defaultSettings, 1);
    expect(device.queue.onSubmittedWorkDone).toHaveBeenCalledOnce();
    session.destroy();
    expect(renderer.destroy).toHaveBeenCalledOnce();
    expect(device.destroy).toHaveBeenCalledOnce();
    expect(scheduler.cancel).toHaveBeenCalledOnce();
  });

  it('keeps rendering through the loop and follows new settings', async () => {
    const device = fakeDevice();
    const renderer = fakeRenderer();
    const scheduler = new ManualScheduler();
    const session = await startRenderSession(
      {} as HTMLCanvasElement,
      256,
      defaultSettings,
      dependencies(device, renderer, scheduler),
    );
    scheduler.tick(16);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    const next = mergeSettings(defaultSettings, { exposure: 1 });
    session.setSettings(next);
    scheduler.tick(32);
    expect(renderer.render).toHaveBeenLastCalledWith(next, expect.any(Number));
    expect(session.resolutionLog().length).toBeGreaterThan(0);
    session.destroy();
  });

  it('stops after the idle frame budget when one is given', async () => {
    const device = fakeDevice();
    const renderer = fakeRenderer();
    const scheduler = new ManualScheduler();
    await startRenderSession(
      {} as HTMLCanvasElement,
      64,
      defaultSettings,
      dependencies(device, renderer, scheduler, { idleAfterFrames: 1 }),
    );
    renderer.accumulatedFrames = 1;
    scheduler.tick(16);
    scheduler.tick(32);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(scheduler.callback).toBeNull();
  });

  it('exports with the current settings and the shared sky', async () => {
    const device = fakeDevice();
    const renderer = fakeRenderer();
    const scheduler = new ManualScheduler();
    const renderStill = vi.fn<SessionDependencies['renderStill']>(() =>
      Promise.resolve({ width: 4, height: 4, rgba: new Uint8Array(64) }),
    );
    const session = await startRenderSession(
      {} as HTMLCanvasElement,
      256,
      defaultSettings,
      dependencies(device, renderer, scheduler, { renderStill }),
    );
    const next = mergeSettings(defaultSettings, { overlays: { isco: true } });
    session.setSettings(next);
    await session.exportImage({ width: 1024, height: 1024, frames: 8 });
    expect(renderStill).toHaveBeenCalledWith(
      device,
      renderer.sky,
      { settings: next, size: { width: 1024, height: 1024 }, frames: 8 },
      { width: 256, height: 256 },
    );
    await session.exportImage({ width: 64, height: 64 });
    expect(renderStill.mock.calls[1]?.[2]).toEqual({
      settings: next,
      size: { width: 64, height: 64 },
    });
    session.destroy();
  });

  it('fails with the detail when no device is available', async () => {
    await expect(
      startRenderSession({} as HTMLCanvasElement, 256, defaultSettings, {
        acquire: () =>
          Promise.resolve({ status: 'unsupported', reason: 'no-adapter', detail: 'none' }),
        createRenderer: () => Promise.reject(new Error('unreachable')),
        renderStill: () => Promise.reject(new Error('unreachable')),
        scheduler: new ManualScheduler(),
      }),
    ).rejects.toThrow('none');
  });
});
