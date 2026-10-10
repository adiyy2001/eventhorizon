import { renderCpuImage } from '../core/render/cpu-image';
import {
  cpuSupportedSettings,
  defaultSettings,
  mergeSettings,
  sanitizeSettings,
} from '../core/render/settings';
import { defaultView } from '../core/render/view';
import { type DeviceResult } from '../gpu/device';
import { type SkyResources } from '../gpu/sky-resources';
import { traceResultBytes } from '../gpu/trace-result';
import {
  type AutomationDependencies,
  createAutomationApi,
  installAutomation,
  type RendererHandle,
} from './automation';
import { LoopbackPool } from './fallback/testing/loopback';

class FakeDevice {
  readonly destroy = vi.fn();
  private readonly listeners: ((event: { error: { message: string } }) => void)[] = [];

  addEventListener(_type: string, listener: (event: { error: { message: string } }) => void) {
    this.listeners.push(listener);
  }

  fail(message: string): void {
    this.listeners.forEach((listener) => {
      listener({ error: { message } });
    });
  }
}

const adapter = { vendor: 'acme', architecture: 'gen-9', device: '', description: '' };

function dependencies(
  device: FakeDevice,
  overrides: Partial<AutomationDependencies> = {},
): AutomationDependencies {
  const renderFrames = vi.fn(() => Promise.resolve());
  const render = vi.fn(() => ({
    frameIndex: 0,
    reset: true,
    internal: { width: 2, height: 2 },
  }));
  const renderer: RendererHandle = {
    sky: {} as SkyResources,
    render,
    accumulatedFrames: 0,
    framesInFlight: 0,
    gpuMeasurement: null,
    renderFrames,
    readOutcomes: () => Promise.resolve(new Uint32Array([0, 1, 2, 2])),
    readRadiance: () =>
      Promise.resolve(new Float32Array([0, 0, 0, 1, 0.5, 0, 0, 1, 2, 0, 0, 1, 4, 0, 0, 1])),
    capture: vi.fn<RendererHandle['capture']>(() =>
      Promise.resolve({ width: 2, height: 2, rgba: new Uint8Array(16) }),
    ),
    destroy: vi.fn(),
  };
  return {
    acquire: () =>
      Promise.resolve<DeviceResult>({
        status: 'ready',
        device: device as unknown as GPUDevice,
        adapter,
        timestampQuery: false,
      }),
    compile: () => Promise.resolve({ messages: [] }),
    runParity: () =>
      Promise.resolve({
        results: new ArrayBuffer(2 * traceResultBytes),
        milliseconds: 3,
        messages: [],
      }),
    runColorParity: () =>
      Promise.resolve({ outputs: new Float32Array([1, 2, 3, 4]), messages: [] }),
    createSky: () => Promise.resolve({ sky: {} as SkyResources, destroy: vi.fn() }),
    createRenderer: () => Promise.resolve(renderer),
    renderStill: () => Promise.resolve({ width: 4, height: 3, rgba: new Uint8Array(48) }),
    runMotion: () => Promise.resolve([]),
    makeCanvas: () => null,
    encodePng: () => Promise.resolve('cG5n'),
    workerPorts: null,
    ...overrides,
  };
}

describe('automation hook', () => {
  it('compiles every shader and reports the messages by name', async () => {
    const device = new FakeDevice();
    const compile = vi.fn(() =>
      Promise.resolve({
        messages: [{ type: 'warning' as const, line: 1, column: 1, message: 'm' }],
      }),
    );
    const api = createAutomationApi(dependencies(device, { compile }));
    const response = await api.compileShaders();
    expect(Object.keys(response.messages).sort()).toEqual([
      'accumulate',
      'bake',
      'bloom',
      'colorparity',
      'image',
      'parity',
      'present',
    ]);
    expect(response.messages['image']).toHaveLength(1);
    expect(response.adapter).toEqual(adapter);
    expect(device.destroy).toHaveBeenCalledOnce();
  });

  it('decodes the parity results into records', async () => {
    const device = new FakeDevice();
    const api = createAutomationApi(dependencies(device));
    const response = await api.runParity({
      rays: [
        { position: [30, 0, 0], direction: [-1, 0, 0] },
        { position: [30, 0, 0], direction: [-1, 0, 0] },
      ],
      view: defaultView,
    });
    expect(response.records).toHaveLength(2);
    expect(response.milliseconds).toBe(3);
  });

  it('renders a view and returns outcomes, radiance and the encoded image', async () => {
    const device = new FakeDevice();
    const api = createAutomationApi(dependencies(device));
    const response = await api.renderView({ view: defaultView, size: { width: 2, height: 2 } });
    expect(response.outcomes).toEqual([0, 1, 2, 2]);
    expect(response.radiance).toEqual([0, 0, 0, 0.5, 0, 0, 2, 0, 0, 4, 0, 0]);
    expect(response.frames).toBe(1);
    expect(response.pngBase64).toBe('cG5n');
    expect(device.destroy).toHaveBeenCalledOnce();
  });

  it('passes the frame count and post settings to the renderer', async () => {
    const device = new FakeDevice();
    const deps = dependencies(device);
    const renderer = await deps.createRenderer({} as GPUDevice, { width: 2, height: 2 }, null);
    const api = createAutomationApi({ ...deps, createRenderer: () => Promise.resolve(renderer) });
    const post = { exposure: 1, bloomStrength: 0.1, ditherAmplitude: 0 };
    const response = await api.renderView({
      view: defaultView,
      size: { width: 2, height: 2 },
      frames: 8,
      post,
    });
    expect(response.frames).toBe(8);
    expect(renderer.renderFrames).toHaveBeenCalledWith(
      sanitizeSettings({ view: defaultView, exposure: 1, bloomStrength: 0.1 }),
      8,
    );
  });

  it('accepts full settings and clamps them', async () => {
    const device = new FakeDevice();
    const deps = dependencies(device);
    const renderer = await deps.createRenderer({} as GPUDevice, { width: 2, height: 2 }, null);
    const api = createAutomationApi({ ...deps, createRenderer: () => Promise.resolve(renderer) });
    await api.renderView({
      size: { width: 2, height: 2 },
      settings: { split: { enabled: true, position: 9 }, overlays: { isco: true } },
    });
    const [settings] = vi.mocked(renderer.renderFrames).mock.calls[0] ?? [];
    expect(settings?.split).toEqual({ enabled: true, position: 0.98 });
    expect(settings?.overlays.isco).toBe(true);
    expect(settings?.view).toEqual(defaultSettings.view);
  });

  it('renders a sequence on one renderer and reports the accumulated frames per step', async () => {
    const device = new FakeDevice();
    const deps = dependencies(device);
    const renderer = await deps.createRenderer({} as GPUDevice, { width: 2, height: 2 }, null);
    let accumulated = 0;
    renderer.render = vi.fn(() => {
      accumulated += 1;
      renderer.accumulatedFrames = accumulated;
      return { frameIndex: accumulated - 1, reset: false, internal: { width: 2, height: 2 } };
    });
    const api = createAutomationApi({
      ...deps,
      createRenderer: () => Promise.resolve(renderer),
    });
    (device as unknown as { queue: unknown }).queue = {
      onSubmittedWorkDone: () => Promise.resolve(),
    };
    const response = await api.renderSequence({
      size: { width: 2, height: 2 },
      steps: [
        { settings: {}, frames: 2 },
        { settings: { exposure: 1 }, frames: 3 },
      ],
    });
    expect(renderer.render).toHaveBeenCalledTimes(5);
    expect(response.stepFrames).toEqual([2, 5]);
    expect(response.frames).toBe(5);
    expect(renderer.capture).toBeDefined();
    expect(device.destroy).toHaveBeenCalledOnce();
  });

  it('exports an image at the requested size', async () => {
    const device = new FakeDevice();
    const renderStill = vi.fn(() =>
      Promise.resolve({ width: 4, height: 3, rgba: new Uint8Array(48) }),
    );
    const api = createAutomationApi(dependencies(device, { renderStill }));
    const response = await api.exportImage({ width: 4, height: 3, frames: 2 });
    expect(response).toMatchObject({ width: 4, height: 3, pngBase64: 'cG5n' });
    expect(renderStill).toHaveBeenCalledOnce();
    expect(device.destroy).toHaveBeenCalledOnce();
  });

  it('runs the motion plan and returns its log', async () => {
    const device = new FakeDevice();
    (device as unknown as { queue: unknown }).queue = {
      onSubmittedWorkDone: () => Promise.resolve(),
    };
    const log = [{ frame: 0, moving: false, scale: 1, frameMs: 0, gpuMs: null }];
    const runMotion = vi.fn(() => Promise.resolve(log));
    const api = createAutomationApi(dependencies(device, { runMotion }));
    const response = await api.runMotion({
      size: { width: 2, height: 2 },
      plan: { moveFrames: 5 },
    });
    expect(response.log).toEqual(log);
    expect(response.timestampQuery).toBe(false);
    const plan = (runMotion.mock.calls[0] as unknown as [unknown, unknown, unknown, unknown])[3];
    expect(plan).toMatchObject({ moveFrames: 5, restFrames: 3 });
  });

  it('runs a colour parity mode and returns the outputs', async () => {
    const device = new FakeDevice();
    const runColorParity = vi.fn(() =>
      Promise.resolve({ outputs: new Float32Array([1, 2, 3, 4]), messages: [] }),
    );
    const api = createAutomationApi(dependencies(device, { runColorParity }));
    const response = await api.runColorParity({ mode: 'lut', inputs: [6500, 0, 0, 0] });
    expect(response.outputs).toEqual([1, 2, 3, 4]);
    expect(runColorParity).toHaveBeenCalledOnce();
    expect(device.destroy).toHaveBeenCalledOnce();
  });

  it('reinterprets integer inputs as raw 32 bit words', async () => {
    const device = new FakeDevice();
    const runColorParity = vi.fn(
      (_device: GPUDevice, _sky: SkyResources, _mode: string, inputs: Float32Array) =>
        Promise.resolve({
          outputs: new Float32Array(inputs.buffer.slice(0)),
          messages: [],
        }),
    );
    const api = createAutomationApi(dependencies(device, { runColorParity }));
    const response = await api.runColorParity({
      mode: 'hash',
      inputs: [3735928559, 1, 2, 3],
      inputsAreUint32: true,
    });
    expect(new Uint32Array(Float32Array.from(response.outputs).buffer)[0]).toBe(3735928559);
  });

  it('turns an uncaptured GPU error into a failure', async () => {
    const device = new FakeDevice();
    const api = createAutomationApi(
      dependencies(device, {
        runParity: () => {
          device.fail('invalid bind group');
          return Promise.resolve({ results: new ArrayBuffer(0), milliseconds: 0, messages: [] });
        },
      }),
    );
    await expect(api.runParity({ rays: [], view: defaultView })).rejects.toThrow(
      'invalid bind group',
    );
  });

  it('reports a missing WebGPU device as an error', async () => {
    const api = createAutomationApi({
      ...dependencies(new FakeDevice()),
      acquire: () =>
        Promise.resolve<DeviceResult>({ status: 'unsupported', reason: 'no-api', detail: 'none' }),
    });
    await expect(api.compileShaders()).rejects.toThrow('WebGPU unavailable: none');
  });

  it('installs itself on the window it is given', () => {
    const target = {} as Window;
    installAutomation(target, dependencies(new FakeDevice()));
    expect(target.eventhorizonAutomation).toBeDefined();
  });
});

const softwareRenderTimeout = 30_000;

describe('automation hook software view', { timeout: softwareRenderTimeout }, () => {
  const size = { width: 24, height: 24 };

  function withWorkers(
    encodePng: AutomationDependencies['encodePng'] = () => Promise.resolve('cG5n'),
  ) {
    const pool = new LoopbackPool();
    const answering = setInterval(() => {
      pool.answerAll();
    }, 0);
    const api = createAutomationApi(
      dependencies(new FakeDevice(), { workerPorts: pool.create, encodePng }),
    );
    return {
      api,
      pool,
      stop: () => {
        clearInterval(answering);
      },
    };
  }

  it('renders the final software image on the worker pool and encodes it', async () => {
    const encodePng = vi.fn(() => Promise.resolve('aW1hZ2U='));
    const { api, pool, stop } = withWorkers(encodePng);
    const settings = mergeSettings(defaultSettings, { bloomStrength: 0 });
    const response = await api.renderCpuView({ size, settings });
    stop();
    expect(response).toMatchObject({ width: 24, height: 24, pngBase64: 'aW1hZ2U=' });
    expect(response.workers).toBe(pool.ports.length);
    expect(response.workers).toBeGreaterThan(0);
    expect(response.firstImageMilliseconds).toBeGreaterThanOrEqual(0);
    expect(response.fullImageMilliseconds).toBeGreaterThanOrEqual(response.firstImageMilliseconds);
    const calls = encodePng.mock.calls as unknown as [Uint8Array, number, number][];
    const [pixels, width, height] = calls[0] ?? [];
    expect([width, height]).toEqual([24, 24]);
    expect([...(pixels ?? [])]).toEqual([...renderCpuImage(cpuSupportedSettings(settings), size)]);
    expect(pool.ports.every((port) => port.terminated)).toBe(true);
  });

  it('uses the worker count it is given within the pool limits', async () => {
    const counts: number[] = [];
    for (const requested of [3, 100, 0, 2.6]) {
      const { api, pool, stop } = withWorkers();
      const response = await api.renderCpuView({ size, workers: requested });
      stop();
      counts.push(response.workers);
      expect(pool.ports).toHaveLength(response.workers);
    }
    expect(counts).toEqual([3, 8, 1, 3]);
  });

  it('leaves out the overlays only the graphics path can draw', async () => {
    const { api, pool, stop } = withWorkers();
    await api.renderCpuView({
      size,
      settings: { overlays: { photonSphere: true, isco: true, shadowEdge: true } },
    });
    stop();
    const requests = pool.ports.flatMap((port) => port.posted);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((request) => !request.settings.overlays.isco)).toBe(true);
    expect(requests.every((request) => request.settings.overlays.shadowEdge)).toBe(true);
  });

  it('refuses to render without worker ports', async () => {
    const api = createAutomationApi(dependencies(new FakeDevice()));
    await expect(api.renderCpuView({ size })).rejects.toThrow('software workers are not available');
  });

  it('reports a worker failure', async () => {
    const pool = new LoopbackPool();
    const api = createAutomationApi(dependencies(new FakeDevice(), { workerPorts: pool.create }));
    const pending = api.renderCpuView({ size });
    pool.ports[0]?.crash('worker died');
    await expect(pending).rejects.toThrow('worker died');
  });

  it('reports an encoding failure', async () => {
    const { api, stop } = withWorkers(() => Promise.reject(new Error('no canvas')));
    await expect(api.renderCpuView({ size })).rejects.toThrow('no canvas');
    stop();
  });
});

describe('automation hook capture sessions', () => {
  async function open() {
    const device = new FakeDevice();
    const deps = dependencies(device);
    const renderer = await deps.createRenderer({} as GPUDevice, { width: 2, height: 2 }, null);
    const createRenderer = vi.fn(() => Promise.resolve(renderer));
    const api = createAutomationApi({ ...deps, createRenderer });
    const opened = await api.openCapture({ size: { width: 2, height: 2 } });
    return { api, device, renderer, createRenderer, opened };
  }

  it('keeps one device and renderer across frames', async () => {
    const { api, device, renderer, createRenderer, opened } = await open();
    expect(opened.adapter).toEqual(adapter);
    expect(createRenderer).toHaveBeenCalledOnce();
    const first = await api.captureFrame({ id: opened.id, view: { ...defaultView, azimuth: 0.1 } });
    const second = await api.captureFrame({
      id: opened.id,
      view: { ...defaultView, azimuth: 0.2 },
      frames: 3,
    });
    expect(first).toEqual({ width: 2, height: 2, frames: 1, pngBase64: 'cG5n' });
    expect(second.frames).toBe(3);
    expect(createRenderer).toHaveBeenCalledOnce();
    expect(renderer.renderFrames).toHaveBeenCalledTimes(2);
    expect(vi.mocked(renderer.renderFrames).mock.calls.map(([, frames]) => frames)).toEqual([1, 3]);
    expect(vi.mocked(renderer.renderFrames).mock.calls[1]?.[0].view.azimuth).toBeCloseTo(0.2);
    expect(device.destroy).not.toHaveBeenCalled();
  });

  it('captures with the settings it rendered', async () => {
    const { api, renderer, opened } = await open();
    await api.captureFrame({ id: opened.id, settings: { exposure: 1.5 } });
    const [settings] = vi.mocked(renderer.capture).mock.calls[0] ?? [];
    expect(settings?.exposure).toBe(1.5);
  });

  it('numbers the sessions apart', async () => {
    const { api, opened } = await open();
    const another = await api.openCapture({ size: { width: 2, height: 2 } });
    expect(another.id).not.toBe(opened.id);
    await expect(api.captureFrame({ id: another.id })).resolves.toBeDefined();
    await expect(api.captureFrame({ id: opened.id })).resolves.toBeDefined();
  });

  it('releases the renderer and the device when closed', async () => {
    const { api, device, renderer, opened } = await open();
    await api.closeCapture({ id: opened.id });
    expect(renderer.destroy).toHaveBeenCalledOnce();
    expect(device.destroy).toHaveBeenCalledOnce();
    await expect(api.captureFrame({ id: opened.id })).rejects.toThrow('is not open');
    await expect(api.closeCapture({ id: opened.id })).rejects.toThrow('is not open');
  });

  it('turns an uncaptured GPU error into a failure', async () => {
    const { api, device, opened } = await open();
    device.fail('invalid texture');
    await expect(api.captureFrame({ id: opened.id })).rejects.toThrow('invalid texture');
  });

  it('refuses an unknown session', async () => {
    const { api } = await open();
    await expect(api.captureFrame({ id: 99 })).rejects.toThrow('capture session 99 is not open');
  });

  it('reports a missing WebGPU device when opening', async () => {
    const api = createAutomationApi({
      ...dependencies(new FakeDevice()),
      acquire: () =>
        Promise.resolve<DeviceResult>({ status: 'unsupported', reason: 'no-api', detail: 'none' }),
    });
    await expect(api.openCapture({ size: { width: 2, height: 2 } })).rejects.toThrow(
      'WebGPU unavailable: none',
    );
  });
});
