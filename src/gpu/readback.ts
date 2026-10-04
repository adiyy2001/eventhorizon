export async function readBuffer(
  device: GPUDevice,
  source: GPUBuffer,
  byteLength: number,
): Promise<ArrayBuffer> {
  const staging = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(source, 0, staging, 0, byteLength);
  device.queue.submit([encoder.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const copy = staging.getMappedRange().slice(0, byteLength);
  staging.unmap();
  staging.destroy();
  return copy;
}
