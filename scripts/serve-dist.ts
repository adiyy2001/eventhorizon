import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const host = '127.0.0.1';
const port = Number(process.env['PORT'] ?? 4320);
const root = resolve(process.env['DIST_DIR'] ?? 'dist/eventhorizon/browser');

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.vtt': 'text/vtt; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.wgsl': 'text/plain; charset=utf-8',
};

export function resolveRequestPath(requestUrl: string): string {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}`).pathname);
  const candidate = join(root, normalize(pathname));
  const insideRoot = candidate === root || candidate.startsWith(root + sep);
  const isFile = insideRoot && existsSync(candidate) && statSync(candidate).isFile();
  return isFile ? candidate : join(root, 'index.html');
}

const server = createServer((request, response) => {
  const file = resolveRequestPath(request.url ?? '/');
  response.setHeader('Content-Type', contentTypes[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  console.log(`serving ${root} on http://${host}:${String(port)}`);
});
