import { defaultSettings, sanitizeSettings } from '../core/render/settings';
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
    capture: () => Promise.resolve({ width: 2, height: 2, rgba: new Uint8Array(16) }),
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
