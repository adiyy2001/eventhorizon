import {
  acquireDevice,
  type AcquireFailureReason,
  type AdapterSummary,
  type DeviceResult,
} from './device';
import { runSmokeKernel } from './smoke-kernel';
import { countMatchingValues, expectedSmokeValues, smokeElementCount } from './smoke';

export type ProbeFailureReason = AcquireFailureReason | 'kernel-failed';

export interface SmokeReport {
  total: number;
  correct: number;
}

export type GpuProbeResult =
  | { status: 'ready'; adapter: AdapterSummary; smoke: SmokeReport }
  | { status: 'unsupported'; reason: ProbeFailureReason; detail: string };

export interface ProbeDependencies {
  acquire: () => Promise<DeviceResult>;
  runKernel: (device: GPUDevice, count: number) => Promise<ArrayLike<number>>;
}

const defaultDependencies: ProbeDependencies = {
  acquire: () => acquireDevice(),
  runKernel: runSmokeKernel,
};

export async function probeGpu(
  dependencies: ProbeDependencies = defaultDependencies,
): Promise<GpuProbeResult> {
  const acquired = await dependencies.acquire();
  if (acquired.status === 'unsupported') {
    return acquired;
  }
  try {
    const actual = await dependencies.runKernel(acquired.device, smokeElementCount);
    const correct = countMatchingValues(actual, expectedSmokeValues(smokeElementCount));
    return {
      status: 'ready',
      adapter: acquired.adapter,
      smoke: { total: smokeElementCount, correct },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: 'unsupported', reason: 'kernel-failed', detail };
  } finally {
    acquired.device.destroy();
  }
}
