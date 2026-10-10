import { type PostSettings } from '../core/render/post';
import {
  cpuSupportedSettings,
  type RenderSettings,
  sanitizeSettings,
} from '../core/render/settings';
import { poolSize } from '../core/render/tile-scheduler';
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
import { browserClock, type CpuFrame, CpuRenderer } from './fallback/cpu-renderer';
import { type WorkerPortFactory } from './fallback/worker-port';
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

export interface CpuViewRequest extends SettingsInput {
  size: { width: number; height: number };
}

export interface CpuViewResponse {
  width: number;
  height: number;
  workers: number;
  firstImageMilliseconds: number;
  fullImageMilliseconds: number;
  pngBase64: string;
}

export interface CaptureOpenRequest {
  size: { width: number; height: number };
}

export interface CaptureOpenResponse {
  id: number;
  adapter: AdapterSummary;
}

export interface CaptureFrameRequest extends SettingsInput {
  id: number;
  frames?: number;
}

export interface CaptureFrameResponse {
  width: number;
  height: number;
  frames: number;
  pngBase64: string;
}

export interface CaptureCloseRequest {
  id: number;
}

export interface AutomationApi {
  compileShaders: () => Promise<CompileResponse>;
  runParity: (request: ParityRequest) => Promise<ParityResponse>;
  renderView: (request: RenderRequest) => Promise<RenderResponse>;
  renderSequence: (request: SequenceRequest) => Promise<SequenceResponse>;
  exportImage: (request: ExportImageRequest) => Promise<ExportImageResponse>;
  runMotion: (request: MotionRequest) => Promise<MotionResponse>;
  runColorParity: (request: ColorParityRequest) => Promise<ColorParityResponse>;
  renderCpuView: (request: CpuViewRequest) => Promise<CpuViewResponse>;
  openCapture: (request: CaptureOpenRequest) => Promise<CaptureOpenResponse>;
  captureFrame: (request: CaptureFrameRequest) => Promise<CaptureFrameResponse>;
  closeCapture: (request: CaptureCloseRequest) => Promise<void>;
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
  workerPorts: WorkerPortFactory | null;
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
  workerPorts: null,
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

interface CaptureSession {
  device: GPUDevice;
  renderer: RendererHandle;
  size: { width: number; height: number };
  assertNoErrors: () => void;
}

function renderOnWorkers(
  dependencies: AutomationDependencies,
  request: CpuViewRequest,
): Promise<CpuViewResponse> {
  const { workerPorts } = dependencies;
  if (workerPorts === null) {
    return Promise.reject(new Error('the software workers are not available in this page'));
  }
  const workers = poolSize(navigator.hardwareConcurrency);
  return new Promise<CpuViewResponse>((resolve, reject) => {
    let finalFrame: CpuFrame | null = null;
    const renderer: CpuRenderer = new CpuRenderer({
      ports: workerPorts,
      workerCount: workers,
      size: request.size,
      clock: browserClock,
      listener: {
        frame: (frame) => {
          if (frame.quality === 'final') {
            finalFrame = frame;
          }
        },
        progress: (progress) => {
          const { firstImageMilliseconds, fullImageMilliseconds } = progress;
          if (
            finalFrame === null ||
            !progress.complete ||
            firstImageMilliseconds === null ||
            fullImageMilliseconds === null
          ) {
            return;
          }
          const { pixels, size } = finalFrame;
          renderer.destroy();
          dependencies
            .encodePng(
              new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
              size.width,
              size.height,
            )
            .then(
              (pngBase64) => {
                resolve({
                  width: size.width,
                  height: size.height,
                  workers,
                  firstImageMilliseconds,
                  fullImageMilliseconds,
                  pngBase64,
                });
              },
              (error: unknown) => {
                reject(error instanceof Error ? error : new Error(String(error)));
              },
            );
        },
        failure: (detail) => {
          reject(new Error(detail));
        },
      },
    });
    renderer.setSettings(cpuSupportedSettings(resolveSettings(request)));
  });
}

export function createAutomationApi(
  dependencies: AutomationDependencies = defaultDependencies,
): AutomationApi {
  const captures = new Map<number, CaptureSession>();
  let nextCapture = 1;
  const captureSession = (id: number): CaptureSession => {
    const session = captures.get(id);
    if (session === undefined) {
      throw new Error(`capture session ${String(id)} is not open`);
    }
    return session;
  };
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
    renderCpuView: (request) => renderOnWorkers(dependencies, request),
    openCapture: async (request) => {
      const { device, adapter, assertNoErrors } = await readyDevice(dependencies);
      const renderer = await dependencies.createRenderer(device, request.size, null);
      const id = nextCapture;
      nextCapture += 1;
      captures.set(id, { device, renderer, size: request.size, assertNoErrors });
      return { id, adapter };
    },
    captureFrame: async (request) => {
      const { renderer, size, assertNoErrors } = captureSession(request.id);
      const settings = resolveSettings(request);
      const frames = request.frames ?? 1;
      await renderer.renderFrames(settings, frames);
      const image = await renderer.capture(settings);
      const pngBase64 = await dependencies.encodePng(image.rgba, image.width, image.height);
      assertNoErrors();
      return { width: size.width, height: size.height, frames, pngBase64 };
    },
    closeCapture: (request) =>
      new Promise<void>((resolve) => {
        const { renderer, device } = captureSession(request.id);
        captures.delete(request.id);
        renderer.destroy();
        device.destroy();
        resolve();
      }),
  };
}

export function installAutomation(
  target: Window = window,
  dependencies: AutomationDependencies = defaultDependencies,
): void {
  target.eventhorizonAutomation = createAutomationApi(dependencies);
}
