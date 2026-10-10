import { TestBed } from '@angular/core/testing';
import { type GpuProbeResult } from '../gpu/probe';
import { GPU_PROBE, GpuStatus, type FallbackReason, unsupportedMessages } from './gpu-status';

const ready: GpuProbeResult = {
  status: 'ready',
  adapter: { vendor: 'acme', architecture: 'gen-9', device: '', description: '' },
  smoke: { total: 8, correct: 8 },
};

async function settle(result: GpuProbeResult | 'pending'): Promise<GpuStatus> {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: GPU_PROBE,
        useValue: () =>
          result === 'pending'
            ? new Promise<GpuProbeResult>(() => undefined)
            : Promise.resolve(result),
      },
    ],
  });
  const status = TestBed.inject(GpuStatus);
  await Promise.resolve();
  return status;
}

describe('GpuStatus', () => {
  it('is checking until the probe answers', async () => {
    const status = await settle('pending');
    expect(status.state()).toEqual({ status: 'checking' });
    expect(status.backend()).toBe('checking');
  });

  it('selects the graphics backend when the probe succeeds', async () => {
    const status = await settle(ready);
    expect(status.state().status).toBe('ready');
    expect(status.backend()).toBe('gpu');
  });

  it.each(['no-api', 'no-adapter', 'device-failed', 'kernel-failed'] as const)(
    'selects the software backend when the probe reports %s',
    async (reason) => {
      const status = await settle({ status: 'unsupported', reason, detail: 'probe detail' });
      expect(status.state()).toEqual({ status: 'unsupported', reason, detail: 'probe detail' });
      expect(status.backend()).toBe('cpu');
    },
  );

  it('switches to the software backend when the graphics device is lost later', async () => {
    const status = await settle(ready);
    status.reportFailure({ reason: 'device-lost', detail: 'GPU hung' });
    expect(status.state()).toEqual({
      status: 'unsupported',
      reason: 'device-lost',
      detail: 'GPU hung',
    });
    expect(status.backend()).toBe('cpu');
  });

  it('has a sentence for every reason the software backend can start for', () => {
    const reasons: FallbackReason[] = [
      'no-api',
      'no-adapter',
      'device-failed',
      'kernel-failed',
      'device-lost',
      'render-failed',
    ];
    expect(Object.keys(unsupportedMessages).sort()).toEqual([...reasons].sort());
    reasons.forEach((reason) => {
      expect(unsupportedMessages[reason]).toMatch(/\.$/);
    });
  });
});
