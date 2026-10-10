import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const pagesHost = 'eventhorizon.adrianturbinski.pl';
export const pagesDirectory = 'dist/eventhorizon/browser';

const requiredFiles = ['index.html', 'CNAME', 'media/preview.webm', 'media/preview-poster.jpg'];

function localReferences(html: string): string[] {
  const references: string[] = [];
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const value = match[1];
    if (value !== undefined && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) {
      references.push(value);
    }
  }
  return references;
}

export function checkPages(directory: string = pagesDirectory): string[] {
  const problems: string[] = [];
  for (const file of requiredFiles) {
    if (!existsSync(join(directory, file))) {
      problems.push(`missing ${file}`);
    }
  }
  const indexPath = join(directory, 'index.html');
  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf8');
    if (!html.includes('<base href="/">')) {
      problems.push('index.html has no base href of /');
    }
    for (const reference of localReferences(html)) {
      if (reference === '/') {
        continue;
      }
      if (reference.startsWith('/')) {
        problems.push(`absolute reference ${reference}`);
      } else if (!existsSync(join(directory, reference.replace(/[?#].*$/, '')))) {
        problems.push(`broken reference ${reference}`);
      }
    }
  }
  const cnamePath = join(directory, 'CNAME');
  if (existsSync(cnamePath) && readFileSync(cnamePath, 'utf8').trim() !== pagesHost) {
    problems.push(`CNAME is not ${pagesHost}`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const problems = checkPages();
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`pages artifact is consistent for https://${pagesHost}/`);
  }
}
