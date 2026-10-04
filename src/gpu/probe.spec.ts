import type { DeviceResult } from './device';
import { probeGpu, type ProbeDependencies } from './probe';
import { expectedSmokeValues } from './smoke';

const adapter = { vendor: 'acme', architecture: 'gen-9', device: 'dev-1', description: 'Acme' };

function readyDevice(destroy: () => void): DeviceResult {
  return { status: 'ready', device: { destroy } as unknown as GPUDevice, adapter };
}

describe('probeGpu', () => {
  it('passes an unsupported result through', async () => {
    const dependencies: ProbeDependencies = {
      acquire: () => Promise.resolve({ status: 'unsupported', reason: 'no-api', detail: 'none' }),
      runKernel: () => Promise.reject(new Error('must not run')),
    };
    expect(await probeGpu(dependencies)).toEqual({
      status: 'unsupported',
      reason: 'no-api',
      detail: 'none',
    });
  });

  it('counts the values the kernel got right and destroys the device', async () => {
    const destroy = vi.fn();
    const dependencies: ProbeDependencies = {
      acquire: () => Promise.resolve(readyDevice(destroy)),
      runKernel: (_device, count) => Promise.resolve(expectedSmokeValues(count)),
    };
    const result = await probeGpu(dependencies);
    expect(result).toEqual({ status: 'ready', adapter, smoke: { total: 1000, correct: 1000 } });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('reports partial results', async () => {
    const dependencies: ProbeDependencies = {
      acquire: () => Promise.resolve(readyDevice(vi.fn())),
      runKernel: (_device, count) => Promise.resolve(new Uint32Array(count)),
    };
    const result = await probeGpu(dependencies);
    expect(result).toMatchObject({ status: 'ready', smoke: { total: 1000, correct: 0 } });
  });

  it('reports kernel-failed and still destroys the device', async () => {
    const destroy = vi.fn();
    const dependencies: ProbeDependencies = {
      acquire: () => Promise.resolve(readyDevice(destroy)),
      runKernel: () => Promise.reject(new Error('validation error')),
    };
    expect(await probeGpu(dependencies)).toEqual({
      status: 'unsupported',
      reason: 'kernel-failed',
      detail: 'validation error',
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('describes a non-Error kernel failure', async () => {
    const dependencies: ProbeDependencies = {
      acquire: () => Promise.resolve(readyDevice(vi.fn())),
      runKernel: () => Promise.reject('plain'),
    };
    expect(await probeGpu(dependencies)).toMatchObject({
      reason: 'kernel-failed',
      detail: 'plain',
    });
  });
});
