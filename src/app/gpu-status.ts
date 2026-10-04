import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { probeGpu, type GpuProbeResult } from '../gpu/probe';

export const GPU_PROBE = new InjectionToken<() => Promise<GpuProbeResult>>('GPU_PROBE', {
  providedIn: 'root',
  factory: () => () => probeGpu(),
});

export type GpuStatusState = { status: 'checking' } | GpuProbeResult;

export const unsupportedMessages: Record<string, string> = {
  'no-api': 'This browser does not expose WebGPU.',
  'no-adapter': 'WebGPU is present but no graphics adapter is available.',
  'device-failed': 'A graphics adapter was found but a device could not be created.',
  'kernel-failed': 'The test compute kernel failed to run.',
};

@Injectable({ providedIn: 'root' })
export class GpuStatus {
  private readonly probe = inject(GPU_PROBE);
  private readonly current = signal<GpuStatusState>({ status: 'checking' });
  readonly state = this.current.asReadonly();

  constructor() {
    void this.probe().then((result) => {
      this.current.set(result);
    });
  }
}
