import { acquireDevice } from './device';

interface FakeAdapterOptions {
  requestDevice: () => Promise<GPUDevice>;
}

const adapterInfo = {
  vendor: 'acme',
  architecture: 'gen-9',
  device: 'dev-1',
  description: 'Acme test adapter',
};

function fakeGpu(requestAdapter: () => Promise<GPUAdapter | null>): GPU {
  return { requestAdapter } as unknown as GPU;
}

function fakeAdapter(options: FakeAdapterOptions): GPUAdapter {
  return { info: adapterInfo, requestDevice: options.requestDevice } as unknown as GPUAdapter;
}

describe('acquireDevice', () => {
  it('reports no-api when navigator.gpu is missing', async () => {
    const result = await acquireDevice(undefined);
    expect(result).toMatchObject({ status: 'unsupported', reason: 'no-api' });
  });

  it('reports no-adapter when requestAdapter returns null', async () => {
    const result = await acquireDevice(fakeGpu(() => Promise.resolve(null)));
    expect(result).toMatchObject({ status: 'unsupported', reason: 'no-adapter' });
  });

  it('reports no-adapter when requestAdapter throws', async () => {
    const result = await acquireDevice(fakeGpu(() => Promise.reject(new Error('blocked'))));
    expect(result).toEqual({ status: 'unsupported', reason: 'no-adapter', detail: 'blocked' });
  });

  it('reports device-failed when the device cannot be created', async () => {
    const adapter = fakeAdapter({
      requestDevice: () => Promise.reject(new Error('out of memory')),
    });
    const result = await acquireDevice(fakeGpu(() => Promise.resolve(adapter)));
    expect(result).toEqual({
      status: 'unsupported',
      reason: 'device-failed',
      detail: 'out of memory',
    });
  });

  it('describes a non-Error rejection', async () => {
    const adapter = fakeAdapter({ requestDevice: () => Promise.reject('plain text') });
    const result = await acquireDevice(fakeGpu(() => Promise.resolve(adapter)));
    expect(result).toMatchObject({ reason: 'device-failed', detail: 'plain text' });
  });

  it('returns the device and a summary of the adapter', async () => {
    const device = { label: 'fake device' } as unknown as GPUDevice;
    const adapter = fakeAdapter({ requestDevice: () => Promise.resolve(device) });
    const result = await acquireDevice(fakeGpu(() => Promise.resolve(adapter)));
    expect(result).toEqual({ status: 'ready', device, adapter: adapterInfo });
  });

  it('falls back to navigator.gpu when no argument is given', async () => {
    const result = await acquireDevice();
    expect(result.status).toBe('unsupported');
  });
});
