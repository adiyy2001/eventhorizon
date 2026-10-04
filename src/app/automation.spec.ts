import { defaultView } from '../core/render/view';
import { type DeviceResult } from '../gpu/device';
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
  const renderer: RendererHandle = {
    render: vi.fn(),
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
      }),
    compile: () => Promise.resolve({ messages: [] }),
    runParity: () =>
      Promise.resolve({
        results: new ArrayBuffer(2 * traceResultBytes),
        milliseconds: 3,
        messages: [],
      }),
    createRenderer: () => Promise.resolve(renderer),
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
    expect(Object.keys(response.messages).sort()).toEqual(['blit', 'image', 'parity']);
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

  it('renders a view and returns outcomes, shade and the encoded image', async () => {
    const device = new FakeDevice();
    const api = createAutomationApi(dependencies(device));
    const response = await api.renderView({ view: defaultView, size: { width: 2, height: 2 } });
    expect(response.outcomes).toEqual([0, 1, 2, 2]);
    expect(response.shade).toEqual([0, 0.5, 2, 4]);
    expect(response.pngBase64).toBe('cG5n');
    expect(device.destroy).toHaveBeenCalledOnce();
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
