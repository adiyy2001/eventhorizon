import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

const placeholderHost = 'http://127.0.0.1';

export function resolveRequestPath(root: string, requestUrl: string): string | null {
  const pathname = decodeURIComponent(new URL(requestUrl, placeholderHost).pathname);
  const candidate = join(root, normalize(pathname));
  const insideRoot = candidate === root || candidate.startsWith(root + sep);
  if (insideRoot && existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  return extname(pathname) === '' ? join(root, 'index.html') : null;
}
