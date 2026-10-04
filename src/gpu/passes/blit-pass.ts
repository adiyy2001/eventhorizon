import { compileShader } from '../shader-compile';
import { blitShader } from '../shader-modules';

export class BlitPass {
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipelines = new Map<GPUTextureFormat, GPURenderPipeline>();
  private module: GPUShaderModule | null = null;

  constructor(private readonly device: GPUDevice) {
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'unfilterable-float' },
        },
      ],
    });
  }

  async prepare(target: GPUTextureFormat): Promise<void> {
    if (this.pipelines.has(target)) {
      return;
    }
    this.module ??= (await compileShader(this.device, 'blit', blitShader)).module;
    this.pipelines.set(
      target,
      this.device.createRenderPipeline({
        label: `blit ${target}`,
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
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
    source: GPUTexture,
    target: GPUTextureView,
    targetFormat: GPUTextureFormat,
  ): void {
    const pipeline = this.pipelines.get(targetFormat);
    if (pipeline === undefined) {
      throw new Error(`blit pipeline for ${targetFormat} was not prepared`);
    }
    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: source.createView() }],
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
}
