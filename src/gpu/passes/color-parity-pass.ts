import { type ColorParityMode } from '../../core/validation/color-parity';
import { compileShader, type ShaderMessage } from '../shader-compile';
import { colorParityShader } from '../shader-modules';
import { readBuffer } from '../readback';
import { workgroupCount } from '../rows';
import { type SkyResources } from '../sky-resources';
import { packColorParityParams } from '../uniforms';

export type { ColorParityMode };

export const colorParityModes: Record<ColorParityMode, number> = {
  lut: 0,
  tonemap: 1,
  stars: 2,
  nebula: 3,
  cubemap: 4,
  hash: 5,
};

export interface ColorParityRun {
  outputs: Float32Array;
  messages: ShaderMessage[];
}

const colorParityWorkgroupSize = 64;

export async function runColorParityPass(
  device: GPUDevice,
  sky: SkyResources,
  mode: ColorParityMode,
  inputs: Float32Array,
): Promise<ColorParityRun> {
  const count = inputs.length / 4;
  const { module, messages } = await compileShader(device, 'colorparity', colorParityShader);
  const pipeline = device.createComputePipeline({
    label: 'colorparity',
    layout: 'auto',
    compute: { module, entryPoint: 'colorParity' },
  });
  const params = packColorParityParams(colorParityModes[mode], count);
  const paramsBuffer = device.createBuffer({
    size: params.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramsBuffer, 0, params);
  const inputBuffer = device.createBuffer({
    size: inputs.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputBuffer, 0, inputs);
  const outputBuffer = device.createBuffer({
    size: inputs.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: inputBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
    ],
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.setBindGroup(1, sky.bindGroup(pipeline, 1));
  pass.dispatchWorkgroups(workgroupCount(count, colorParityWorkgroupSize));
  pass.end();
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const outputs = new Float32Array(await readBuffer(device, outputBuffer, inputs.byteLength));
  paramsBuffer.destroy();
  inputBuffer.destroy();
  outputBuffer.destroy();
  return { outputs, messages };
}
