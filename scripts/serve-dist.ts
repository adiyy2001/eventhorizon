import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { selectByteRange } from './byte-range.ts';
import { resolveRequestPath } from './resolve-request.ts';

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

const server = createServer((request, response) => {
  const file = resolveRequestPath(root, request.url ?? '/');
  if (file === null) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const size = statSync(file).size;
  const selection = selectByteRange(request.headers.range, size);
  response.setHeader('Content-Type', contentTypes[extname(file)] ?? 'application/octet-stream');
  response.setHeader('Accept-Ranges', 'bytes');
  if (selection.kind === 'unsatisfiable') {
    response.writeHead(416, { 'Content-Range': `bytes */${String(size)}` });
    response.end();
    return;
  }
  if (selection.kind === 'partial') {
    response.writeHead(206, {
      'Content-Range': `bytes ${String(selection.start)}-${String(selection.end)}/${String(size)}`,
      'Content-Length': selection.end - selection.start + 1,
    });
    createReadStream(file, { start: selection.start, end: selection.end }).pipe(response);
    return;
  }
  response.setHeader('Content-Length', size);
  createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  console.log(`serving ${root} on http://${host}:${String(port)}`);
});
