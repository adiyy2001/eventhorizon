import { type ViewportSize } from '../core/physics/observer';
import { type RenderSettings, sceneHash, settingsPost } from '../core/render/settings';
import {
  accumulationKey,
  type AccumulationState,
  historyWeight,
  initialAccumulation,
  jitterForFrame,
  stepAccumulation,
} from './accumulation';
import { scaledSize } from './dynamic-resolution';
import { GpuTimer, type GpuMeasurement } from './gpu-timer';
import { AccumulatePass } from './passes/accumulate-pass';
import { BloomPass } from './passes/bloom-pass';
import { PresentPass } from './passes/present-pass';
import { TracePass } from './passes/trace-pass';
import { readBuffer } from './readback';
import { paddedBytesPerRow, removeRowPadding } from './rows';
import { SkyResources } from './sky-resources';
import { type PresentInput } from './uniforms';

export interface CapturedImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export interface FrameInfo {
  frameIndex: number;
  reset: boolean;
  internal: ViewportSize;
}

const captureFormat: GPUTextureFormat = 'rgba8unorm';
const radianceBytesPerPixel = 16;

export class Renderer {
  private accumulation: AccumulationState = initialAccumulation;
  private lastSettings: RenderSettings | null = null;
  private lastInternal: ViewportSize;
  private inFlight = 0;

  private constructor(
    private readonly device: GPUDevice,
    readonly sky: SkyResources,
    private readonly ownsSky: boolean,
    private readonly trace: TracePass,
    private readonly accumulate: AccumulatePass,
    private readonly bloom: BloomPass,
    private readonly present: PresentPass,
    private readonly timer: GpuTimer | null,
    private readonly context: GPUCanvasContext | null,
    private readonly canvasFormat: GPUTextureFormat,
  ) {
    this.lastInternal = trace.size;
  }

  static async create(
    device: GPUDevice,
    size: ViewportSize,
    canvas: HTMLCanvasElement | null,
    sharedSky?: SkyResources,
  ): Promise<Renderer> {
    const sky = sharedSky ?? (await SkyResources.create(device));
    const trace = await TracePass.create(device, size, sky);
    const accumulate = await AccumulatePass.create(device, size, trace.radiance, trace.overlay);
    const bloom = await BloomPass.create(device, size, accumulate.resolved);
    const present = new PresentPass(device);
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    let context: GPUCanvasContext | null = null;
    if (canvas !== null) {
      context = canvas.getContext('webgpu');
      context?.configure({ device, format: canvasFormat, alphaMode: 'opaque' });
      await present.prepare(canvasFormat);
    }
    await present.prepare(captureFormat);
    const timer = device.features.has('timestamp-query') ? new GpuTimer(device) : null;
    return new Renderer(
      device,
      sky,
      sharedSky === undefined,
      trace,
      accumulate,
      bloom,
      present,
      timer,
      context,
      canvasFormat,
    );
  }

  get size(): ViewportSize {
    return this.trace.size;
  }

  get internalSize(): ViewportSize {
    return this.lastInternal;
  }

  get accumulatedFrames(): number {
    return this.accumulation.frames;
  }

  get framesInFlight(): number {
    return this.inFlight;
  }

  get gpuMeasurement(): GpuMeasurement | null {
    return this.timer?.lastMeasurement ?? null;
  }

  resetAccumulation(): void {
    this.accumulation = initialAccumulation;
  }

  private presentInput(settings: RenderSettings, internal: ViewportSize): PresentInput {
    return {
      post: settingsPost(settings),
      view: settings.view,
      shadowEdge: settings.overlays.shadowEdge,
      split: settings.split,
      internal,
      target: this.trace.size,
    };
  }

  render(settings: RenderSettings, scale = 1): FrameInfo {
    const internal = scaledSize(this.trace.size, scale);
    const key = accumulationKey(sceneHash(settings), internal.width, internal.height);
    const step = stepAccumulation(this.accumulation, key);
    this.accumulation = step.state;
    this.lastSettings = settings;
    this.lastInternal = internal;
    const encoder = this.device.createCommandEncoder({ label: 'frame' });
    const timing = this.context === null ? null : (this.timer?.begin(scale) ?? null);
    this.trace.encode(
      encoder,
      {
        view: settings.view,
        size: internal,
        jitter: jitterForFrame(step.frameIndex),
        overlays: settings.overlays,
        split: settings.split,
      },
      timing?.first,
    );
    this.accumulate.encode(encoder, internal, historyWeight(step.frameIndex));
    this.bloom.encode(
      encoder,
      internal.width / this.trace.size.width,
      internal.height / this.trace.size.height,
    );
    if (this.context !== null) {
      this.present.encode(
        encoder,
        this.accumulate.resolved,
        this.bloom.output,
        this.accumulate.latestOverlay,
        this.presentInput(settings, internal),
        this.context.getCurrentTexture().createView(),
        this.canvasFormat,
        timing?.last,
      );
    }
    this.timer?.finish(encoder);
    this.device.queue.submit([encoder.finish()]);
    this.inFlight += 1;
    const release = (): void => {
      this.inFlight -= 1;
    };
    void this.device.queue.onSubmittedWorkDone().then(release, release);
    return { frameIndex: step.frameIndex, reset: step.reset, internal };
  }

  async renderFrames(settings: RenderSettings, frames: number): Promise<void> {
    this.resetAccumulation();
    for (let frame = 0; frame < frames; frame += 1) {
      this.render(settings);
      await this.device.queue.onSubmittedWorkDone();
    }
  }

  async readOutcomes(): Promise<Uint32Array> {
    const { width, height } = this.lastInternal;
    const bytes = width * height * Uint32Array.BYTES_PER_ELEMENT;
    await this.device.queue.onSubmittedWorkDone();
    return new Uint32Array(await readBuffer(this.device, this.trace.outcomes, bytes));
  }

  async readRadiance(): Promise<Float32Array> {
    const { width, height } = this.lastInternal;
    const bytesPerRow = paddedBytesPerRow(width, radianceBytesPerPixel);
    const staging = this.device.createBuffer({
      label: 'radiance staging',
      size: bytesPerRow * height,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = this.device.createCommandEncoder({ label: 'radiance readback' });
    encoder.copyTextureToBuffer(
      { texture: this.accumulate.latest },
      { buffer: staging, bytesPerRow },
      [width, height],
    );
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const padded = new Uint8Array(staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();
    const packed = removeRowPadding(padded, width, height, radianceBytesPerPixel);
    return new Float32Array(packed.buffer, packed.byteOffset, packed.byteLength / 4);
  }

  async capture(settings: RenderSettings | null = this.lastSettings): Promise<CapturedImage> {
    if (settings === null) {
      throw new Error('nothing has been rendered yet');
    }
    const { width, height } = this.trace.size;
    const bytesPerRow = paddedBytesPerRow(width, 4);
    const target = this.device.createTexture({
      label: 'capture',
      size: [width, height],
      format: captureFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const staging = this.device.createBuffer({
      label: 'capture staging',
      size: bytesPerRow * height,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = this.device.createCommandEncoder({ label: 'capture' });
    this.present.encode(
      encoder,
      this.accumulate.resolved,
      this.bloom.output,
      this.accumulate.latestOverlay,
      this.presentInput(settings, this.lastInternal),
      target.createView(),
      captureFormat,
    );
    encoder.copyTextureToBuffer({ texture: target }, { buffer: staging, bytesPerRow }, [
      width,
      height,
    ]);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const padded = new Uint8Array(staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();
    target.destroy();
    return { width, height, rgba: removeRowPadding(padded, width, height, 4) };
  }

  destroy(): void {
    this.trace.destroy();
    this.accumulate.destroy();
    this.bloom.destroy();
    this.present.destroy();
    this.timer?.destroy();
    if (this.ownsSky) {
      this.sky.destroy();
    }
  }
}
