import { type ViewportSize } from '../../core/physics/observer';
import { compileShader } from '../shader-compile';
import { bloomShader } from '../shader-modules';

export const bloomFormat: GPUTextureFormat = 'rgba16float';
export const maxBloomLevels = 5;
const smallestLevelEdge = 4;

export function bloomLevelSizes(size: ViewportSize): ViewportSize[] {
  const sizes: ViewportSize[] = [];
  let width = Math.max(1, Math.floor(size.width / 2));
  let height = Math.max(1, Math.floor(size.height / 2));
  while (sizes.length < maxBloomLevels && Math.min(width, height) >= smallestLevelEdge) {
    sizes.push({ width, height });
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  }
  return sizes.length === 0 ? [{ width: 1, height: 1 }] : sizes;
}

export class BloomPass {
  readonly levels: readonly GPUTexture[];
  private readonly sampler: GPUSampler;
  private readonly layout: GPUBindGroupLayout;
  private readonly firstDownsample: GPURenderPipeline;
  private readonly downsample: GPURenderPipeline;
  private readonly upsample: GPURenderPipeline;
  private readonly sourceBindGroups: GPUBindGroup[];

  private constructor(
    private readonly device: GPUDevice,
    module: GPUShaderModule,
    size: ViewportSize,
    resolved: GPUTexture,
  ) {
    this.levels = bloomLevelSizes(size).map((levelSize, index) =>
      device.createTexture({
        label: `bloom ${String(index)}`,
        size: [levelSize.width, levelSize.height],
        format: bloomFormat,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC,
      }),
    );
    this.sampler = device.createSampler({
      label: 'bloom sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    const additive: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
    const pipelineFor = (entryPoint: string, blend?: GPUBlendState): GPURenderPipeline =>
      device.createRenderPipeline({
        label: entryPoint,
        layout,
        vertex: { module, entryPoint: 'vertexMain' },
        fragment: {
          module,
          entryPoint,
          targets: [blend === undefined ? { format: bloomFormat } : { format: bloomFormat, blend }],
        },
        primitive: { topology: 'triangle-list' },
      });
    this.firstDownsample = pipelineFor('downsampleFirst');
    this.downsample = pipelineFor('downsample');
    this.upsample = pipelineFor('upsample', { color: additive, alpha: additive });
    const bindGroupFor = (texture: GPUTexture): GPUBindGroup =>
      device.createBindGroup({
        layout: this.layout,
        entries: [
          { binding: 0, resource: texture.createView() },
          { binding: 1, resource: this.sampler },
        ],
      });
    this.sourceBindGroups = [resolved, ...this.levels].map(bindGroupFor);
  }

  static async create(
    device: GPUDevice,
    size: ViewportSize,
    resolved: GPUTexture,
  ): Promise<BloomPass> {
    const { module } = await compileShader(device, 'bloom', bloomShader);
    return new BloomPass(device, module, size, resolved);
  }

  get output(): GPUTexture {
    const [first] = this.levels;
    if (first === undefined) {
      throw new Error('bloom has no levels');
    }
    return first;
  }

  private draw(
    encoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    bindGroup: GPUBindGroup,
    target: GPUTexture,
    loadOp: GPULoadOp,
  ): void {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp,
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  encode(encoder: GPUCommandEncoder): void {
    this.levels.forEach((level, index) => {
      const bindGroup = this.sourceBindGroups[index];
      if (bindGroup === undefined) {
        return;
      }
      this.draw(
        encoder,
        index === 0 ? this.firstDownsample : this.downsample,
        bindGroup,
        level,
        'clear',
      );
    });
    for (let index = this.levels.length - 2; index >= 0; index -= 1) {
      const smaller = this.sourceBindGroups[index + 2];
      const larger = this.levels[index];
      if (smaller !== undefined && larger !== undefined) {
        this.draw(encoder, this.upsample, smaller, larger, 'load');
      }
    }
  }

  destroy(): void {
    for (const level of this.levels) {
      level.destroy();
    }
  }
}
