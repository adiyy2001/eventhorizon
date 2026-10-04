import smokeSource from './shaders/smoke.wgsl';
import { smokeWorkgroupSize, workgroupCount } from './smoke';

export async function runSmokeKernel(device: GPUDevice, count: number): Promise<Uint32Array> {
  const byteLength = count * Uint32Array.BYTES_PER_ELEMENT;
  const module = device.createShaderModule({ code: smokeSource });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });
  const storage = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readback = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: storage } }],
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(workgroupCount(count, smokeWorkgroupSize));
  pass.end();
  encoder.copyBufferToBuffer(storage, 0, readback, 0, byteLength);
  device.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);
  const values = new Uint32Array(readback.getMappedRange().slice(0));
  readback.unmap();
  storage.destroy();
  readback.destroy();
  return values;
}
