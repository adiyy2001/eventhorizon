import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkPages, pagesHost } from './check-pages.ts';

let directory = '';

function write(name: string, content: string): void {
  const path = join(directory, name);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function healthyArtifact(): void {
  write(
    'index.html',
    '<html><head><base href="/"><link rel="stylesheet" href="styles.css"><script src="main.js"></script></head></html>',
  );
  write('styles.css', 'body{}');
  write('main.js', 'void 0;');
  write('CNAME', `${pagesHost}\n`);
  write('media/preview.webm', 'x');
  write('media/preview-poster.jpg', 'x');
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'eventhorizon-pages-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('checkPages', () => {
  it('accepts a consistent artifact', () => {
    healthyArtifact();
    expect(checkPages(directory)).toEqual([]);
  });

  it('reports a missing CNAME and a missing video', () => {
    healthyArtifact();
    rmSync(join(directory, 'CNAME'));
    rmSync(join(directory, 'media/preview.webm'));
    expect(checkPages(directory)).toEqual(['missing CNAME', 'missing media/preview.webm']);
  });

  it('reports a CNAME for another host', () => {
    healthyArtifact();
    write('CNAME', 'example.org\n');
    expect(checkPages(directory)).toEqual([`CNAME is not ${pagesHost}`]);
  });

  it('reports a base href below the root', () => {
    healthyArtifact();
    write('index.html', '<html><head><base href="/eventhorizon/"></head></html>');
    expect(checkPages(directory)).toContain('index.html has no base href of /');
  });

  it('reports broken and absolute references but ignores external ones', () => {
    healthyArtifact();
    write(
      'index.html',
      '<html><head><base href="/"><script src="gone.js"></script><script src="/root.js"></script><link href="https://fonts.example/a.css"><a href="#top"></a></head></html>',
    );
    expect(checkPages(directory)).toEqual([
      'broken reference gone.js',
      'absolute reference /root.js',
    ]);
  });

  it('reports everything missing for an empty folder', () => {
    expect(checkPages(directory)).toHaveLength(4);
  });
});
