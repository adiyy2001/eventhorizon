import { mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { demoDirectory, demoFile, demoSpec, gifArguments } from '../bench/demo-plan';

const framesDirectory =
  process.env['EVENTHORIZON_DEMO_FRAMES'] ?? join(tmpdir(), 'eventhorizon-demo-frames');
const output = join(demoDirectory, demoFile);

mkdirSync(demoDirectory, { recursive: true });
const result = spawnSync('ffmpeg', gifArguments({ framesDirectory, output, spec: demoSpec }), {
  encoding: 'utf8',
});
if (result.status !== 0) {
  throw new Error(`ffmpeg failed: ${result.stderr || String(result.error)}`);
}
const bytes = statSync(output).size;
console.log(`${output}: ${String(bytes)} bytes`);
if (bytes > demoSpec.maxBytes) {
  console.error(`the GIF is larger than ${String(demoSpec.maxBytes)} bytes`);
  process.exitCode = 1;
}
