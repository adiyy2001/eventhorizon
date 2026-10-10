import { channelsPerSample, type CpuShader } from './cpu-frame';
import { type TileRequest, tileSamples } from './tile-scheduler';

export function renderTileSamples(shader: CpuShader, tile: TileRequest): Float32Array<ArrayBuffer> {
  const samples = tileSamples(tile);
  const output = new Float32Array(samples.length * channelsPerSample);
  samples.forEach((sample, index) => {
    shader.writeRadiance(sample.column, sample.row, output, index * channelsPerSample);
  });
  return output;
}
