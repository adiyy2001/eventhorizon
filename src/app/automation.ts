import { type PostSettings } from '../core/render/post';
import { type RenderSettings, sanitizeSettings } from '../core/render/settings';
import { type ViewDescription } from '../core/render/view';
import { type RayRecord } from '../core/validation/parity';
import { type ResolutionLogEntry } from '../gpu/dynamic-resolution';
import { defaultMotionPlan, type MotionPlan, runMotionPlan } from '../gpu/motion-run';
import { browserScheduler, type LoopRenderer } from '../gpu/render-loop';
import { renderStill } from '../gpu/still';
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

export interface SettingsInput {
  settings?: unknown;
  view?: ViewDescription;
  post?: PostSettings;
}

export interface RenderRequest extends SettingsInput {
  size: { width: number; height: number };
  frames?: number;
}

export interface RenderResponse {
  adapter: AdapterSummary;
  outcomes: number[];
  radiance: number[];
  frames: number;
  pngBase64: string;
}

export interface SequenceRequest {
  size: { width: number; height: number };
  steps: (SettingsInput & { frames: number })[];
}

export interface SequenceResponse extends RenderResponse {
  stepFrames: number[];
}

export interface ExportImageRequest extends SettingsInput {
  width: number;
  height: number;
  frames?: number;
}

export interface ExportImageResponse {
  adapter: AdapterSummary;
  width: number;
  height: number;
  pngBase64: string;
}

export interface MotionRequest extends SettingsInput {
  size: { width: number; height: number };
  plan?: Partial<MotionPlan>;
}

export interface MotionResponse {
  adapter: AdapterSummary;
  timestampQuery: boolean;
  log: ResolutionLogEntry[];
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
  renderSequence: (request: SequenceRequest) => Promise<SequenceResponse>;
  exportImage: (request: ExportImageRequest) => Promise<ExportImageResponse>;
  runMotion: (request: MotionRequest) => Promise<MotionResponse>;
  runColorParity: (request: ColorParityRequest) => Promise<ColorParityResponse>;
}

declare global {
  interface Window {
    eventhorizonAutomation?: AutomationApi;
  }
}

export interface RendererHandle extends LoopRenderer {
  sky: SkyHandle['sky'];
  renderFrames: (settings: RenderSettings, frames: number) => Promise<void>;
  readOutcomes: () => Promise<Uint32Array>;
  readRadiance: () => Promise<Float32Array>;
  capture: (settings?: RenderSettings | null) => Promise<CapturedImage>;
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
    canvas: HTMLCanvasElement | null,
  ) => Promise<RendererHandle>;
  renderStill: typeof renderStill;
  runMotion: typeof runMotionPlan;
  makeCanvas: (size: { width: number; height: number }) => HTMLCanvasElement | null;
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
  createRenderer: (device, size, canvas) => Renderer.create(device, size, canvas),
  renderStill,
  runMotion: runMotionPlan,
  makeCanvas: (size) => {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    return canvas;
  },
  encodePng: rgbaToPngBase64,
};

export function resolveSettings(input: SettingsInput): RenderSettings {
  if (input.settings !== undefined) {
    return sanitizeSettings(input.settings);
  }
  return sanitizeSettings({
    view: input.view,
    exposure: input.post?.exposure,
    bloomStrength: input.post?.bloomStrength,
  });
}

async function renderResponse(
  dependencies: AutomationDependencies,
  renderer: RendererHandle,
  adapter: AdapterSummary,
  settings: RenderSettings,
  frames: number,
  stepFrames: number[] = [],
): Promise<SequenceResponse> {
  const outcomes = Array.from(await renderer.readOutcomes());
  const stored = await renderer.readRadiance();
  const radiance = new Array<number>(outcomes.length * 3);
  for (let index = 0; index < outcomes.length; index += 1) {
    radiance[index * 3] = stored[index * 4] ?? 0;
    radiance[index * 3 + 1] = stored[index * 4 + 1] ?? 0;
    radiance[index * 3 + 2] = stored[index * 4 + 2] ?? 0;
  }
  const image = await renderer.capture(settings);
  const pngBase64 = await dependencies.encodePng(image.rgba, image.width, image.height);
  return { adapter, outcomes, radiance, frames, pngBase64, stepFrames };
}

interface GuardedDevice {
  device: GPUDevice;
  adapter: AdapterSummary;
  timestampQuery: boolean;
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
      const renderer = await dependencies.createRenderer(device, request.size, null);
      const settings = resolveSettings(request);
      const frames = request.frames ?? 1;
      await renderer.renderFrames(settings, frames);
      const response = await renderResponse(dependencies, renderer, adapter, settings, frames);
      assertNoErrors();
      renderer.destroy();
      device.destroy();
      return response;
    },
    renderSequence: async (request) => {
      const { device, adapter, assertNoErrors } = await readyDevice(dependencies);
      const renderer = await dependencies.createRenderer(device, request.size, null);
      let settings = resolveSettings({});
      const stepFrames: number[] = [];
      for (const step of request.steps) {
        settings = resolveSettings(step);
        for (let frame = 0; frame < step.frames; frame += 1) {
          renderer.render(settings, 1);
          await device.queue.onSubmittedWorkDone();
        }
        stepFrames.push(renderer.accumulatedFrames);
      }
      const response = await renderResponse(
        dependencies,
        renderer,
        adapter,
        settings,
        renderer.accumulatedFrames,
        stepFrames,
      );
      assertNoErrors();
      renderer.destroy();
      device.destroy();
      return response;
    },
    exportImage: async (request) => {
      const { device, adapter, assertNoErrors } = await readyDevice(dependencies);
      const handle = await dependencies.createSky(device);
      const image = await dependencies.renderStill(
        device,
        handle.sky,
        {
          settings: resolveSettings(request),
          size: { width: request.width, height: request.height },
          ...(request.frames === undefined ? {} : { frames: request.frames }),
        },
        { width: request.width, height: request.height },
      );
      const pngBase64 = await dependencies.encodePng(image.rgba, image.width, image.height);
      assertNoErrors();
      handle.destroy();
      device.destroy();
      return { adapter, width: image.width, height: image.height, pngBase64 };
    },
    runMotion: async (request) => {
      const { device, adapter, assertNoErrors, timestampQuery } = await readyDevice(dependencies);
      const renderer = await dependencies.createRenderer(
        device,
        request.size,
        dependencies.makeCanvas(request.size),
      );
      const log = await dependencies.runMotion(
        renderer,
        browserScheduler,
        resolveSettings(request),
        { ...defaultMotionPlan, ...request.plan },
      );
      await device.queue.onSubmittedWorkDone();
      assertNoErrors();
      renderer.destroy();
      device.destroy();
      return { adapter, timestampQuery, log };
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
