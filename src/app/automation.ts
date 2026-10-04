import { defaultPost, type PostSettings } from '../core/render/post';
import { type ViewDescription } from '../core/render/view';
import { type RayRecord } from '../core/validation/parity';
import { acquireDevice, type AdapterSummary, type DeviceResult } from '../gpu/device';
import { type ColorParityMode, runColorParityPass } from '../gpu/passes/color-parity-pass';
import { runParityPass } from '../gpu/passes/parity-pass';
import { type CapturedImage, Renderer } from '../gpu/renderer';
import { compileShader, type ShaderMessage } from '../gpu/shader-compile';
import { compiledShaders } from '../gpu/shader-modules';
import { SkyResources } from '../gpu/sky-resources';
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
  frames?: number;
  post?: PostSettings;
}

export interface RenderResponse {
  adapter: AdapterSummary;
  outcomes: number[];
  radiance: number[];
  frames: number;
  pngBase64: string;
}

export interface ColorParityRequest {
  mode: ColorParityMode;
  inputs: number[];
  inputsAreUint32?: boolean;
}

export interface ColorParityResponse {
  adapter: AdapterSummary;
  outputs: number[];
  messages: ShaderMessage[];
}

export interface CompileResponse {
  adapter: AdapterSummary;
  messages: Record<string, ShaderMessage[]>;
}

export interface AutomationApi {
  compileShaders: () => Promise<CompileResponse>;
  runParity: (request: ParityRequest) => Promise<ParityResponse>;
  renderView: (request: RenderRequest) => Promise<RenderResponse>;
  runColorParity: (request: ColorParityRequest) => Promise<ColorParityResponse>;
}

declare global {
  interface Window {
    eventhorizonAutomation?: AutomationApi;
  }
}

export interface RendererHandle {
  renderFrames: (view: ViewDescription, frames: number, post: PostSettings) => Promise<void>;
  readOutcomes: () => Promise<Uint32Array>;
  readRadiance: () => Promise<Float32Array>;
  capture: () => Promise<CapturedImage>;
  destroy: () => void;
}

export interface SkyHandle {
  sky: SkyResources;
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
  runColorParity: typeof runColorParityPass;
  createSky: (device: GPUDevice) => Promise<SkyHandle>;
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
  runColorParity: runColorParityPass,
  createSky: async (device) => {
    const sky = await SkyResources.create(device);
    return {
      sky,
      destroy: () => {
        sky.destroy();
      },
    };
  },
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
      for (const [name, code] of Object.entries(compiledShaders)) {
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
      const frames = request.frames ?? 1;
      await renderer.renderFrames(request.view, frames, request.post ?? defaultPost);
      const outcomes = Array.from(await renderer.readOutcomes());
      const stored = await renderer.readRadiance();
      const radiance = new Array<number>(outcomes.length * 3);
      for (let index = 0; index < outcomes.length; index += 1) {
        radiance[index * 3] = stored[index * 4] ?? 0;
        radiance[index * 3 + 1] = stored[index * 4 + 1] ?? 0;
        radiance[index * 3 + 2] = stored[index * 4 + 2] ?? 0;
      }
      const image = await renderer.capture();
      const pngBase64 = await dependencies.encodePng(image.rgba, image.width, image.height);
      assertNoErrors();
      renderer.destroy();
      device.destroy();
      return { adapter, outcomes, radiance, frames, pngBase64 };
    },
    runColorParity: async (request) => {
      const { device, adapter, assertNoErrors } = await readyDevice(dependencies);
      const handle = await dependencies.createSky(device);
      const inputs = new Float32Array(request.inputs.length);
      if (request.inputsAreUint32 === true) {
        new Uint32Array(inputs.buffer).set(request.inputs);
      } else {
        inputs.set(request.inputs);
      }
      const run = await dependencies.runColorParity(device, handle.sky, request.mode, inputs);
      assertNoErrors();
      handle.destroy();
      device.destroy();
      return { adapter, outputs: Array.from(run.outputs), messages: run.messages };
    },
  };
}

export function installAutomation(
  target: Window = window,
  dependencies: AutomationDependencies = defaultDependencies,
): void {
  target.eventhorizonAutomation = createAutomationApi(dependencies);
}
