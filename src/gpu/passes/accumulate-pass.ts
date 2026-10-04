import { type ViewportSize } from '../../core/physics/observer';
import { compileShader } from '../shader-compile';
import { accumulateShader } from '../shader-modules';
import { workgroupCount } from '../rows';
import { packAccumulateParams, accumulateParamsLayout } from '../uniforms';

export const historyFormat: GPUTextureFormat = 'rgba32float';
export const resolvedFormat: GPUTextureFormat = 'rgba16float';
const accumulateWorkgroupEdge = 8;

export class AccumulatePass {
  readonly resolved: GPUTexture;
  private readonly histories: readonly [GPUTexture, GPUTexture];
  private readonly bindGroups: readonly [GPUBindGroup, GPUBindGroup];
  private readonly paramsBuffer: GPUBuffer;
  private writeIndex: 0 | 1 = 0;

  private constructor(
    private readonly device: GPUDevice,
    private readonly pipeline: GPUComputePipeline,
    private readonly size: ViewportSize,
    current: GPUTexture,
  ) {
    const historyUsage =
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC;
    const makeHistory = (label: string): GPUTexture =>
      device.createTexture({
        label,
        size: [size.width, size.height],
        format: historyFormat,
        usage: historyUsage,
      });
    this.histories = [makeHistory('history a'), makeHistory('history b')];
    this.resolved = device.createTexture({
      label: 'resolved',
      size: [size.width, size.height],
      format: resolvedFormat,
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
    this.paramsBuffer = device.createBuffer({
      label: 'accumulate params',
      size: accumulateParamsLayout.size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroupFor = (read: GPUTexture, write: GPUTexture): GPUBindGroup =>
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.paramsBuffer } },
          { binding: 1, resource: current.createView() },
          { binding: 2, resource: read.createView() },
          { binding: 3, resource: write.createView() },
          { binding: 4, resource: this.resolved.createView() },
        ],
      });
    const [first, second] = this.histories;
    this.bindGroups = [bindGroupFor(first, second), bindGroupFor(second, first)];
  }

  static async create(
    device: GPUDevice,
    size: ViewportSize,
    current: GPUTexture,
  ): Promise<AccumulatePass> {
    const { module } = await compileShader(device, 'accumulate', accumulateShader);
    const pipeline = device.createComputePipeline({
      label: 'accumulate',
      layout: 'auto',
      compute: { module, entryPoint: 'accumulate' },
    });
    return new AccumulatePass(device, pipeline, size, current);
  }

  get latest(): GPUTexture {
    return this.histories[this.writeIndex];
  }

  encode(encoder: GPUCommandEncoder, weight: number): void {
    const params = packAccumulateParams(this.size.width, this.size.height, weight);
    this.device.queue.writeBuffer(this.paramsBuffer, 0, params);
    const pass = encoder.beginComputePass({ label: 'accumulate' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroups[this.writeIndex]);
    pass.dispatchWorkgroups(
      workgroupCount(this.size.width, accumulateWorkgroupEdge),
      workgroupCount(this.size.height, accumulateWorkgroupEdge),
    );
    pass.end();
    this.writeIndex = this.writeIndex === 0 ? 1 : 0;
  }

  destroy(): void {
    this.histories[0].destroy();
    this.histories[1].destroy();
    this.resolved.destroy();
    this.paramsBuffer.destroy();
  }
}
