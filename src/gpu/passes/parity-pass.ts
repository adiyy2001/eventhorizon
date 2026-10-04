import { type ViewDescription } from '../../core/render/view';
import { parityShader } from '../shader-modules';
import { compileShader, type ShaderMessage } from '../shader-compile';
import { readBuffer } from '../readback';
import { rayBuffer, workgroupCount } from '../rows';
import { traceResultBytes } from '../trace-result';
import { packTraceParams } from '../uniforms';

export interface ParityInput {
  rays: readonly {
    position: readonly [number, number, number];
    direction: readonly [number, number, number];
  }[];
  view: ViewDescription;
}

export interface ParityRun {
  results: ArrayBuffer;
  milliseconds: number;
  messages: ShaderMessage[];
}

const parityWorkgroupSize = 64;

export async function runParityPass(device: GPUDevice, input: ParityInput): Promise<ParityRun> {
  const count = input.rays.length;
  const { module, messages } = await compileShader(device, 'parity', parityShader);
  const pipeline = device.createComputePipeline({
    label: 'parity',
    layout: 'auto',
    compute: { module, entryPoint: 'traceParity' },
  });
  const params = packTraceParams({
    view: input.view,
    size: { width: 1, height: 1 },
    jitter: { x: 0, y: 0 },
    rayCount: count,
  });
  const paramsBuffer = device.createBuffer({
    size: params.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramsBuffer, 0, params);
  const rays = rayBuffer(input.rays);
  const raysBuffer = device.createBuffer({
    size: rays.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(raysBuffer, 0, rays);
  const resultBytes = count * traceResultBytes;
  const resultsBuffer = device.createBuffer({
    size: resultBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: raysBuffer } },
      { binding: 2, resource: { buffer: resultsBuffer } },
    ],
  });
  const started = performance.now();
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(workgroupCount(count, parityWorkgroupSize));
  pass.end();
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const milliseconds = performance.now() - started;
  const results = await readBuffer(device, resultsBuffer, resultBytes);
  paramsBuffer.destroy();
  raysBuffer.destroy();
  resultsBuffer.destroy();
  return { results, milliseconds, messages };
}
