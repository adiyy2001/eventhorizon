import { computed, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { probeGpu, type GpuProbeResult, type ProbeFailureReason } from '../gpu/probe';

export const GPU_PROBE = new InjectionToken<() => Promise<GpuProbeResult>>('GPU_PROBE', {
  providedIn: 'root',
  factory: () => () => probeGpu(),
});

export type RuntimeFailureReason = 'device-lost' | 'render-failed';
export type FallbackReason = ProbeFailureReason | RuntimeFailureReason;

export interface GpuFailure {
  reason: RuntimeFailureReason;
  detail: string;
}

export type GraphicsBackend = 'checking' | 'gpu' | 'cpu';

export type GpuStatusState =
  | { status: 'checking' }
  | Extract<GpuProbeResult, { status: 'ready' }>
  | { status: 'unsupported'; reason: FallbackReason; detail: string };

export const unsupportedMessages: Record<FallbackReason, string> = {
  'no-api': 'This browser does not expose WebGPU.',
  'no-adapter': 'WebGPU is present but no graphics adapter is available.',
  'device-failed': 'A graphics adapter was found but a device could not be created.',
  'kernel-failed': 'The test compute kernel failed to run.',
  'device-lost': 'The graphics device was lost while rendering.',
  'render-failed': 'The graphics renderer could not start.',
};

@Injectable({ providedIn: 'root' })
export class GpuStatus {
  private readonly probe = inject(GPU_PROBE);
  private readonly current = signal<GpuStatusState>({ status: 'checking' });
  readonly state = this.current.asReadonly();
  readonly backend = computed<GraphicsBackend>(() => {
    switch (this.current().status) {
      case 'checking':
        return 'checking';
      case 'ready':
        return 'gpu';
      case 'unsupported':
        return 'cpu';
    }
  });

  constructor() {
    void this.probe().then((result) => {
      this.current.set(result);
    });
  }

  reportFailure(failure: GpuFailure): void {
    this.current.set({ status: 'unsupported', ...failure });
  }
}
