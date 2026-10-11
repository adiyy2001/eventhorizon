import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveRequestPath } from './resolve-request.ts';

let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'eventhorizon-resolve-'));
  writeFileSync(join(root, 'index.html'), '<html></html>');
  mkdirSync(join(root, 'media'));
  writeFileSync(join(root, 'media', 'preview.webm'), 'x');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolveRequestPath', () => {
  it('serves an existing file', () => {
    expect(resolveRequestPath(root, '/media/preview.webm?x=1')).toBe(
      join(root, 'media', 'preview.webm'),
    );
  });

  it('falls back to the index for extensionless application routes', () => {
    expect(resolveRequestPath(root, '/')).toBe(join(root, 'index.html'));
    expect(resolveRequestPath(root, '/some/route?inc=40')).toBe(join(root, 'index.html'));
  });

  it('answers a missing file with an extension as not found', () => {
    expect(resolveRequestPath(root, '/robots.txt')).toBeNull();
    expect(resolveRequestPath(root, '/media/missing.webm')).toBeNull();
  });

  it('never resolves outside the root', () => {
    expect(resolveRequestPath(root, '/../../etc/passwd')).toBe(join(root, 'index.html'));
    expect(resolveRequestPath(root, '/..%2f..%2fetc%2fhosts.txt')).toBeNull();
  });
});
