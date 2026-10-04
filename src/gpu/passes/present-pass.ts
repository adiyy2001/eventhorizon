import { type PostSettings } from '../../core/render/post';
import { compileShader } from '../shader-compile';
import { presentShader } from '../shader-modules';
import { packPresentParams, presentParamsLayout } from '../uniforms';

export class PresentPass {
  private readonly layout: GPUBindGroupLayout;
  private readonly pipelines = new Map<GPUTextureFormat, GPURenderPipeline>();
  private readonly paramsBuffer: GPUBuffer;
  private readonly sampler: GPUSampler;
  private module: GPUShaderModule | null = null;

  constructor(private readonly device: GPUDevice) {
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    this.paramsBuffer = device.createBuffer({
      label: 'present params',
      size: presentParamsLayout.size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sampler = device.createSampler({
      label: 'present sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  }

  async prepare(target: GPUTextureFormat): Promise<void> {
    if (this.pipelines.has(target)) {
      return;
    }
    this.module ??= (await compileShader(this.device, 'present', presentShader)).module;
    this.pipelines.set(
      target,
      this.device.createRenderPipeline({
        label: `present ${target}`,
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.layout] }),
        vertex: { module: this.module, entryPoint: 'vertexMain' },
        fragment: {
          module: this.module,
          entryPoint: 'fragmentMain',
          targets: [{ format: target }],
        },
        primitive: { topology: 'triangle-list' },
      }),
    );
  }

  encode(
    encoder: GPUCommandEncoder,
    hdr: GPUTexture,
    bloom: GPUTexture,
    post: PostSettings,
    target: GPUTextureView,
    targetFormat: GPUTextureFormat,
  ): void {
    const pipeline = this.pipelines.get(targetFormat);
    if (pipeline === undefined) {
      throw new Error(`present pipeline for ${targetFormat} was not prepared`);
    }
    this.device.queue.writeBuffer(this.paramsBuffer, 0, packPresentParams(post));
    const bindGroup = this.device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: hdr.createView() },
        { binding: 2, resource: bloom.createView() },
        { binding: 3, resource: this.sampler },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: target, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  destroy(): void {
    this.paramsBuffer.destroy();
  }
}
