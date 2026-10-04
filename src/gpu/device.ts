export interface AdapterSummary {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
}

export type AcquireFailureReason = 'no-api' | 'no-adapter' | 'device-failed';

export type DeviceResult =
  | { status: 'ready'; device: GPUDevice; adapter: AdapterSummary; timestampQuery: boolean }
  | { status: 'unsupported'; reason: AcquireFailureReason; detail: string };

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeAdapter(info: GPUAdapterInfo): AdapterSummary {
  return {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
  };
}

function defaultGpu(): GPU | undefined {
  return typeof navigator !== 'undefined' && 'gpu' in navigator ? navigator.gpu : undefined;
}

export async function acquireDevice(gpu: GPU | undefined = defaultGpu()): Promise<DeviceResult> {
  if (gpu === undefined) {
    return { status: 'unsupported', reason: 'no-api', detail: 'navigator.gpu is not available' };
  }
  let adapter: GPUAdapter | null;
  try {
    adapter = await gpu.requestAdapter();
  } catch (error) {
    return { status: 'unsupported', reason: 'no-adapter', detail: describeError(error) };
  }
  if (adapter === null) {
    return { status: 'unsupported', reason: 'no-adapter', detail: 'requestAdapter returned null' };
  }
  try {
    const timestampQuery = adapter.features.has('timestamp-query');
    const device = await adapter.requestDevice(
      timestampQuery ? { requiredFeatures: ['timestamp-query'] } : {},
    );
    return { status: 'ready', device, adapter: summarizeAdapter(adapter.info), timestampQuery };
  } catch (error) {
    return { status: 'unsupported', reason: 'device-failed', detail: describeError(error) };
  }
}
