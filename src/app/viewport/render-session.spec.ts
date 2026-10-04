import { defaultView } from '../../core/render/view';
import { type DeviceResult } from '../../gpu/device';
import { startRenderSession, type SessionDependencies } from './render-session';

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
  };
}

describe('startRenderSession', () => {
  it('renders one frame, waits for the queue and tears everything down on destroy', async () => {
    const device = fakeDevice();
    const renderer = { render: vi.fn(), destroy: vi.fn() };
    const createRenderer = vi.fn<SessionDependencies['createRenderer']>(() =>
      Promise.resolve(renderer),
    );
    const canvas = {} as HTMLCanvasElement;
    const session = await startRenderSession(canvas, 256, defaultView, {
      acquire: () => Promise.resolve(ready(device)),
      createRenderer,
    });
    expect(createRenderer).toHaveBeenCalledWith(device, { width: 256, height: 256 }, canvas);
    expect(renderer.render).toHaveBeenCalledWith(defaultView);
    expect(device.queue.onSubmittedWorkDone).toHaveBeenCalledOnce();
    session.destroy();
    expect(renderer.destroy).toHaveBeenCalledOnce();
    expect(device.destroy).toHaveBeenCalledOnce();
  });

  it('fails with the detail when no device is available', async () => {
    await expect(
      startRenderSession({} as HTMLCanvasElement, 256, defaultView, {
        acquire: () =>
          Promise.resolve({ status: 'unsupported', reason: 'no-adapter', detail: 'none' }),
        createRenderer: () => Promise.reject(new Error('unreachable')),
      }),
    ).rejects.toThrow('none');
  });
});
