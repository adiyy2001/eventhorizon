import { LUT_SIZE } from '../core/color/temperature-lut';
import { lutTexels } from './lut-texels';
import { bakeNebulaCubemap } from './passes/bake-pass';

export const lutFormat: GPUTextureFormat = 'rgba16float';

export class SkyResources {
  private constructor(
    private readonly device: GPUDevice,
    readonly lut: GPUTexture,
    readonly cube: GPUTexture,
    readonly sampler: GPUSampler,
  ) {}

  static async create(device: GPUDevice): Promise<SkyResources> {
    const lut = device.createTexture({
      label: 'temperature lut',
      size: [LUT_SIZE, 1],
      format: lutFormat,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: lut }, lutTexels(), { bytesPerRow: LUT_SIZE * 8 }, [
      LUT_SIZE,
      1,
    ]);
    const cube = await bakeNebulaCubemap(device);
    const sampler = device.createSampler({
      label: 'sky sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    return new SkyResources(device, lut, cube, sampler);
  }

  bindGroup(pipeline: GPUComputePipeline, group: number): GPUBindGroup {
    return this.device.createBindGroup({
      label: 'sky',
      layout: pipeline.getBindGroupLayout(group),
      entries: [
        { binding: 0, resource: this.lut.createView() },
        { binding: 1, resource: this.cube.createView({ dimension: 'cube' }) },
        { binding: 2, resource: this.sampler },
      ],
    });
  }

  destroy(): void {
    this.lut.destroy();
    this.cube.destroy();
  }
}
