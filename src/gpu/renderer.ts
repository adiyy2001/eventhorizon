import { type ViewportSize } from '../core/physics/observer';
import { type ViewDescription } from '../core/render/view';
import { BlitPass } from './passes/blit-pass';
import { TracePass } from './passes/trace-pass';
import { readBuffer } from './readback';
import { paddedBytesPerRow, removeRowPadding } from './rows';

export interface CapturedImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

const captureFormat: GPUTextureFormat = 'rgba8unorm';

export class Renderer {
  private constructor(
    private readonly device: GPUDevice,
    private readonly trace: TracePass,
    private readonly blit: BlitPass,
    private readonly context: GPUCanvasContext | null,
    private readonly canvasFormat: GPUTextureFormat,
  ) {}

  static async create(
    device: GPUDevice,
    size: ViewportSize,
    canvas: HTMLCanvasElement | null,
  ): Promise<Renderer> {
    const trace = await TracePass.create(device, size);
    const blit = new BlitPass(device);
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    let context: GPUCanvasContext | null = null;
    if (canvas !== null) {
      context = canvas.getContext('webgpu');
      context?.configure({ device, format: canvasFormat, alphaMode: 'opaque' });
      await blit.prepare(canvasFormat);
    }
    await blit.prepare(captureFormat);
    return new Renderer(device, trace, blit, context, canvasFormat);
  }

  get size(): ViewportSize {
    return this.trace.size;
  }

  render(view: ViewDescription, jitter = { x: 0, y: 0 }): void {
    const encoder = this.device.createCommandEncoder({ label: 'frame' });
    this.trace.encode(encoder, view, jitter);
    if (this.context !== null) {
      this.blit.encode(
        encoder,
        this.trace.radiance,
        this.context.getCurrentTexture().createView(),
        this.canvasFormat,
      );
    }
    this.device.queue.submit([encoder.finish()]);
  }

  async readOutcomes(): Promise<Uint32Array> {
    const { width, height } = this.trace.size;
    const bytes = width * height * Uint32Array.BYTES_PER_ELEMENT;
    await this.device.queue.onSubmittedWorkDone();
    return new Uint32Array(await readBuffer(this.device, this.trace.outcomes, bytes));
  }

  async readRadiance(): Promise<Float32Array> {
    const { width, height } = this.trace.size;
    const bytesPerPixel = 16;
    const bytesPerRow = paddedBytesPerRow(width, bytesPerPixel);
    const staging = this.device.createBuffer({
      label: 'radiance staging',
      size: bytesPerRow * height,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = this.device.createCommandEncoder({ label: 'radiance readback' });
    encoder.copyTextureToBuffer(
      { texture: this.trace.radiance },
      { buffer: staging, bytesPerRow },
      [width, height],
    );
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const padded = new Uint8Array(staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();
    const packed = removeRowPadding(padded, width, height, bytesPerPixel);
    return new Float32Array(packed.buffer, packed.byteOffset, packed.byteLength / 4);
  }

  async capture(): Promise<CapturedImage> {
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
    this.blit.encode(encoder, this.trace.radiance, target.createView(), captureFormat);
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
  }
}
