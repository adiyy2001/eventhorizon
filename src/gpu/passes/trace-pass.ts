import { type ViewportSize } from '../../core/physics/observer';
import { type ViewDescription } from '../../core/render/view';
import { compileShader } from '../shader-compile';
import { imageShader } from '../shader-modules';
import { workgroupCount } from '../rows';
import { type SkyResources } from '../sky-resources';
import { packTraceParams } from '../uniforms';

export const traceWorkgroupEdge = 8;
export const radianceFormat: GPUTextureFormat = 'rgba32float';

export class TracePass {
  readonly radiance: GPUTexture;
  readonly outcomes: GPUBuffer;
  private readonly paramsBuffer: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;
  private readonly skyBindGroup: GPUBindGroup;

  private constructor(
    private readonly device: GPUDevice,
    private readonly pipeline: GPUComputePipeline,
    readonly size: ViewportSize,
    sky: SkyResources,
  ) {
    this.radiance = device.createTexture({
      label: 'radiance',
      size: [size.width, size.height],
      format: radianceFormat,
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
    this.outcomes = device.createBuffer({
      label: 'outcomes',
      size: size.width * size.height * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.paramsBuffer = device.createBuffer({
      label: 'trace params',
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: this.radiance.createView() },
        { binding: 2, resource: { buffer: this.outcomes } },
      ],
    });
    this.skyBindGroup = sky.bindGroup(pipeline, 1);
  }

  static async create(
    device: GPUDevice,
    size: ViewportSize,
    sky: SkyResources,
  ): Promise<TracePass> {
    const { module } = await compileShader(device, 'image', imageShader);
    const pipeline = device.createComputePipeline({
      label: 'image',
      layout: 'auto',
      compute: { module, entryPoint: 'renderImage' },
    });
    return new TracePass(device, pipeline, size, sky);
  }

  encode(
    encoder: GPUCommandEncoder,
    view: ViewDescription,
    jitter: { x: number; y: number },
  ): void {
    const params = packTraceParams({ view, size: this.size, jitter, rayCount: 0 });
    this.device.queue.writeBuffer(this.paramsBuffer, 0, params);
    const pass = encoder.beginComputePass({ label: 'trace' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setBindGroup(1, this.skyBindGroup);
    pass.dispatchWorkgroups(
      workgroupCount(this.size.width, traceWorkgroupEdge),
      workgroupCount(this.size.height, traceWorkgroupEdge),
    );
    pass.end();
  }

  destroy(): void {
    this.radiance.destroy();
    this.outcomes.destroy();
    this.paramsBuffer.destroy();
  }
}
