import { type ViewportSize } from '../../core/physics/observer';
import { compileShader } from '../shader-compile';
import { accumulateShader } from '../shader-modules';
import { workgroupCount } from '../rows';
import { packAccumulateParams, accumulateParamsLayout } from '../uniforms';
import { overlayFormat } from './trace-pass';

export const historyFormat: GPUTextureFormat = 'rgba32float';
export const resolvedFormat: GPUTextureFormat = 'rgba16float';
const accumulateWorkgroupEdge = 8;

export class AccumulatePass {
  readonly resolved: GPUTexture;
  private readonly histories: readonly [GPUTexture, GPUTexture];
  private readonly overlayHistories: readonly [GPUTexture, GPUTexture];
  private readonly bindGroups: readonly [GPUBindGroup, GPUBindGroup];
  private readonly paramsBuffer: GPUBuffer;
  private writeIndex: 0 | 1 = 0;

  private constructor(
    private readonly device: GPUDevice,
    private readonly pipeline: GPUComputePipeline,
    size: ViewportSize,
    current: GPUTexture,
    overlayCurrent: GPUTexture,
  ) {
    const historyUsage =
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC;
    const makeHistory = (label: string, format: GPUTextureFormat): GPUTexture =>
      device.createTexture({
        label,
        size: [size.width, size.height],
        format,
        usage: historyUsage,
      });
    this.histories = [
      makeHistory('history a', historyFormat),
      makeHistory('history b', historyFormat),
    ];
    this.overlayHistories = [
      makeHistory('overlay history a', overlayFormat),
      makeHistory('overlay history b', overlayFormat),
    ];
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
    const bindGroupFor = (
      read: GPUTexture,
      write: GPUTexture,
      overlayRead: GPUTexture,
      overlayWrite: GPUTexture,
    ): GPUBindGroup =>
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.paramsBuffer } },
          { binding: 1, resource: current.createView() },
          { binding: 2, resource: read.createView() },
          { binding: 3, resource: write.createView() },
          { binding: 4, resource: this.resolved.createView() },
          { binding: 5, resource: overlayCurrent.createView() },
          { binding: 6, resource: overlayRead.createView() },
          { binding: 7, resource: overlayWrite.createView() },
        ],
      });
    const [first, second] = this.histories;
    const [overlayFirst, overlaySecond] = this.overlayHistories;
    this.bindGroups = [
      bindGroupFor(first, second, overlayFirst, overlaySecond),
      bindGroupFor(second, first, overlaySecond, overlayFirst),
    ];
  }

  static async create(
    device: GPUDevice,
    size: ViewportSize,
    current: GPUTexture,
    overlayCurrent: GPUTexture,
  ): Promise<AccumulatePass> {
    const { module } = await compileShader(device, 'accumulate', accumulateShader);
    const pipeline = device.createComputePipeline({
      label: 'accumulate',
      layout: 'auto',
      compute: { module, entryPoint: 'accumulate' },
    });
    return new AccumulatePass(device, pipeline, size, current, overlayCurrent);
  }

  get latest(): GPUTexture {
    return this.histories[this.writeIndex];
  }

  get latestOverlay(): GPUTexture {
    return this.overlayHistories[this.writeIndex];
  }

  encode(encoder: GPUCommandEncoder, size: ViewportSize, weight: number): void {
    const params = packAccumulateParams(size.width, size.height, weight);
    this.device.queue.writeBuffer(this.paramsBuffer, 0, params);
    const pass = encoder.beginComputePass({ label: 'accumulate' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroups[this.writeIndex]);
    pass.dispatchWorkgroups(
      workgroupCount(size.width, accumulateWorkgroupEdge),
      workgroupCount(size.height, accumulateWorkgroupEdge),
    );
    pass.end();
    this.writeIndex = this.writeIndex === 0 ? 1 : 0;
  }

  destroy(): void {
    this.histories[0].destroy();
    this.histories[1].destroy();
    this.overlayHistories[0].destroy();
    this.overlayHistories[1].destroy();
    this.resolved.destroy();
    this.paramsBuffer.destroy();
  }
}
