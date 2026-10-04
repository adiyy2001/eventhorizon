import { type ViewportSize } from '../core/physics/observer';
import { defaultPost, type PostSettings } from '../core/render/post';
import { type ViewDescription } from '../core/render/view';
import { historyWeight, jitterForFrame } from './accumulation';
import { AccumulatePass } from './passes/accumulate-pass';
import { BloomPass } from './passes/bloom-pass';
import { PresentPass } from './passes/present-pass';
import { TracePass } from './passes/trace-pass';
import { readBuffer } from './readback';
import { paddedBytesPerRow, removeRowPadding } from './rows';
import { SkyResources } from './sky-resources';

export interface CapturedImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

const captureFormat: GPUTextureFormat = 'rgba8unorm';
const radianceBytesPerPixel = 16;

export class Renderer {
  private framesAccumulated = 0;
  private lastPost: PostSettings = defaultPost;

  private constructor(
    private readonly device: GPUDevice,
    readonly sky: SkyResources,
    private readonly trace: TracePass,
    private readonly accumulate: AccumulatePass,
    private readonly bloom: BloomPass,
    private readonly present: PresentPass,
    private readonly context: GPUCanvasContext | null,
    private readonly canvasFormat: GPUTextureFormat,
  ) {}

  static async create(
    device: GPUDevice,
    size: ViewportSize,
    canvas: HTMLCanvasElement | null,
  ): Promise<Renderer> {
    const sky = await SkyResources.create(device);
    const trace = await TracePass.create(device, size, sky);
    const accumulate = await AccumulatePass.create(device, size, trace.radiance);
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
    return new Renderer(device, sky, trace, accumulate, bloom, present, context, canvasFormat);
  }

  get size(): ViewportSize {
    return this.trace.size;
  }

  get accumulatedFrames(): number {
    return this.framesAccumulated;
  }

  resetAccumulation(): void {
    this.framesAccumulated = 0;
  }

  render(view: ViewDescription, post: PostSettings = defaultPost): void {
    this.lastPost = post;
    const encoder = this.device.createCommandEncoder({ label: 'frame' });
    this.trace.encode(encoder, view, jitterForFrame(this.framesAccumulated));
    this.accumulate.encode(encoder, historyWeight(this.framesAccumulated));
    this.framesAccumulated += 1;
    this.bloom.encode(encoder);
    if (this.context !== null) {
      this.present.encode(
        encoder,
        this.accumulate.resolved,
        this.bloom.output,
        post,
        this.context.getCurrentTexture().createView(),
        this.canvasFormat,
      );
    }
    this.device.queue.submit([encoder.finish()]);
  }

  async renderFrames(
    view: ViewDescription,
    frames: number,
    post: PostSettings = defaultPost,
  ): Promise<void> {
    this.resetAccumulation();
    for (let frame = 0; frame < frames; frame += 1) {
      this.render(view, post);
      await this.device.queue.onSubmittedWorkDone();
    }
  }

  async readOutcomes(): Promise<Uint32Array> {
    const { width, height } = this.trace.size;
    const bytes = width * height * Uint32Array.BYTES_PER_ELEMENT;
    await this.device.queue.onSubmittedWorkDone();
    return new Uint32Array(await readBuffer(this.device, this.trace.outcomes, bytes));
  }

  async readRadiance(): Promise<Float32Array> {
    const { width, height } = this.trace.size;
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

  async capture(post: PostSettings = this.lastPost): Promise<CapturedImage> {
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
      post,
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
    this.sky.destroy();
  }
}
