import { build } from 'esbuild';

const entry = process.argv[2] ?? 'bench/gpu-parity.ts';
const outfile = process.argv[3];
if (outfile === undefined) {
  console.error('usage: node bench/windows/bundle-parity.mjs <entry.ts> <outfile.mjs>');
  process.exit(1);
}

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  alias: { '@playwright/test': 'playwright-core' },
  external: ['playwright-core'],
  logLevel: 'warning',
});
