import { compileShader } from '../shader-compile';
import { bakeShader } from '../shader-modules';
import { workgroupCount } from '../rows';
import { packBakeParams } from '../uniforms';

export const cubemapSize = 512;
export const cubemapFormat: GPUTextureFormat = 'rgba16float';
const bakeWorkgroupEdge = 8;

export async function bakeNebulaCubemap(
  device: GPUDevice,
  size = cubemapSize,
): Promise<GPUTexture> {
  const { module } = await compileShader(device, 'bake', bakeShader);
  const pipeline = device.createComputePipeline({
    label: 'bake',
    layout: 'auto',
    compute: { module, entryPoint: 'bakeNebula' },
  });
  const cube = device.createTexture({
    label: 'nebula cubemap',
    size: [size, size, 6],
    format: cubemapFormat,
    usage:
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  const params = packBakeParams(size);
  const paramsBuffer = device.createBuffer({
    label: 'bake params',
    size: params.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramsBuffer, 0, params);
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: cube.createView({ dimension: '2d-array' }) },
    ],
  });
  const encoder = device.createCommandEncoder({ label: 'bake' });
  const pass = encoder.beginComputePass({ label: 'bake nebula' });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(
    workgroupCount(size, bakeWorkgroupEdge),
    workgroupCount(size, bakeWorkgroupEdge),
    6,
  );
  pass.end();
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  paramsBuffer.destroy();
  return cube;
}
