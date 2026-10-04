import { type ViewDescription } from '../core/render/view';
import { type RayRecord } from '../core/validation/parity';
import { acquireDevice, type AdapterSummary, type DeviceResult } from '../gpu/device';
import { runParityPass } from '../gpu/passes/parity-pass';
import { type CapturedImage, Renderer } from '../gpu/renderer';
import { compileShader, type ShaderMessage } from '../gpu/shader-compile';
import { blitShader, imageShader, parityShader } from '../gpu/shader-modules';
import { recordsFromBuffer } from '../gpu/trace-result';
import { rgbaToPngBase64 } from './png';

export interface ParityRequest {
  rays: {
    position: [number, number, number];
    direction: [number, number, number];
  }[];
  view: ViewDescription;
}

export interface ParityResponse {
  adapter: AdapterSummary;
  records: RayRecord[];
  milliseconds: number;
  messages: ShaderMessage[];
}

export interface RenderRequest {
  view: ViewDescription;
  size: { width: number; height: number };
}

export interface RenderResponse {
  adapter: AdapterSummary;
  outcomes: number[];
  shade: number[];
  pngBase64: string;
}

export interface CompileResponse {
  adapter: AdapterSummary;
  messages: Record<string, ShaderMessage[]>;
}

export interface AutomationApi {
  compileShaders: () => Promise<CompileResponse>;
  runParity: (request: ParityRequest) => Promise<ParityResponse>;
  renderView: (request: RenderRequest) => Promise<RenderResponse>;
}

declare global {
  interface Window {
    eventhorizonAutomation?: AutomationApi;
  }
}

export interface RendererHandle {
  render: (view: ViewDescription) => void;
  readOutcomes: () => Promise<Uint32Array>;
  readRadiance: () => Promise<Float32Array>;
  capture: () => Promise<CapturedImage>;
  destroy: () => void;
}

export interface AutomationDependencies {
  acquire: () => Promise<DeviceResult>;
  compile: (
    device: GPUDevice,
    label: string,
    code: string,
  ) => Promise<{ messages: ShaderMessage[] }>;
  runParity: typeof runParityPass;
  createRenderer: (
    device: GPUDevice,
    size: { width: number; height: number },
  ) => Promise<RendererHandle>;
  encodePng: (rgba: Uint8Array, width: number, height: number) => Promise<string>;
}

export const defaultDependencies: AutomationDependencies = {
  acquire: () => acquireDevice(),
  compile: compileShader,
  runParity: runParityPass,
  createRenderer: (device, size) => Renderer.create(device, size, null),
  encodePng: rgbaToPngBase64,
};

interface GuardedDevice {
  device: GPUDevice;
  adapter: AdapterSummary;
  assertNoErrors: () => void;
}

async function readyDevice(dependencies: AutomationDependencies): Promise<GuardedDevice> {
  const acquired = await dependencies.acquire();
  if (acquired.status === 'unsupported') {
    throw new Error(`WebGPU unavailable: ${acquired.detail}`);
  }
  const errors: string[] = [];
  acquired.device.addEventListener('uncapturederror', (event) => {
    errors.push(event.error.message);
  });
  return {
    ...acquired,
    assertNoErrors: () => {
      if (errors.length > 0) {
        throw new Error(`GPU errors: ${errors.join('; ')}`);
      }
    },
  };
}

export function createAutomationApi(
  dependencies: AutomationDependencies = defaultDependencies,
): AutomationApi {
  return {
    compileShaders: async () => {
      const { device, adapter, assertNoErrors } = await readyDevice(dependencies);
      const messages: Record<string, ShaderMessage[]> = {};
      for (const [name, code] of Object.entries({
        image: imageShader,
        parity: parityShader,
        blit: blitShader,
      })) {
        messages[name] = (await dependencies.compile(device, name, code)).messages;
      }
      assertNoErrors();
      device.destroy();
      return { adapter, messages };
    },
    runParity: async (request) => {
      const { device, adapter, assertNoErrors } = await readyDevice(dependencies);
      const run = await dependencies.runParity(device, request);
      const records = recordsFromBuffer(run.results, request.rays.length);
      assertNoErrors();
      device.destroy();
      return { adapter, records, milliseconds: run.milliseconds, messages: run.messages };
    },
    renderView: async (request) => {
      const { device, adapter, assertNoErrors } = await readyDevice(dependencies);
      const renderer = await dependencies.createRenderer(device, request.size);
      renderer.render(request.view);
      const outcomes = Array.from(await renderer.readOutcomes());
      const radiance = await renderer.readRadiance();
      const shade = Array.from({ length: outcomes.length }, (_, index) => radiance[index * 4] ?? 0);
      const image = await renderer.capture();
      const pngBase64 = await dependencies.encodePng(image.rgba, image.width, image.height);
      assertNoErrors();
      renderer.destroy();
      device.destroy();
      return { adapter, outcomes, shade, pngBase64 };
    },
  };
}

export function installAutomation(
  target: Window = window,
  dependencies: AutomationDependencies = defaultDependencies,
): void {
  target.eventhorizonAutomation = createAutomationApi(dependencies);
}
