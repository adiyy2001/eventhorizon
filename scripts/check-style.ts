import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { gpuDeviceBoundFiles } from '../vitest.config.ts';

export interface Violation {
  file: string;
  line: number;
  rule: 'comment' | 'dash' | 'gpu-boundary' | 'repository-owner';
  message: string;
}

const dashPattern = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
const checkedRoots = ['src', 'e2e', 'bench', 'scripts', 'docs', '.github'];
const checkedRootFiles = ['README.md', 'CREDITS.md', 'package.json'];
export const repositoryOwner = 'adiyy2001';
const repositoryUrlPattern = /github\.com\/([\w.-]+)\/eventhorizon\b/g;
const commentExtensions = new Set(['.ts', '.mjs', '.wgsl', '.html', '.css', '.scss']);
const dashExtensions = new Set([
  '.ts',
  '.wgsl',
  '.html',
  '.css',
  '.scss',
  '.md',
  '.json',
  '.mjs',
  '.js',
]);
const generatedFragments = [`${sep}results${sep}`, `${sep}baselines${sep}`];
const deviceApiPattern =
  /\b(GPUBufferUsage|GPUTextureUsage|GPUShaderStage|GPUMapMode|createShaderModule|createComputePipeline|createRenderPipeline|createBuffer|createTexture|createBindGroup|requestAdapter|requestDevice)\b|getContext\(\s*['"]webgpu['"]/;
const deviceApiAllowedWithFakes = ['src/gpu/device.ts'];

function lineOf(text: string, position: number): number {
  let line = 1;
  for (let index = 0; index < position; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function typeScriptCommentPositions(text: string, fileName: string): number[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const found = new Set<number>();
  const collect = (node: ts.Node): void => {
    for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) {
      found.add(range.pos);
    }
    for (const range of ts.getTrailingCommentRanges(text, node.getEnd()) ?? []) {
      found.add(range.pos);
    }
    node.getChildren(source).forEach(collect);
  };
  collect(source);
  return [...found].sort((left, right) => left - right);
}

function scanDelimited(
  text: string,
  openers: readonly string[],
  closers: Record<string, string>,
): number[] {
  const positions: number[] = [];
  let index = 0;
  while (index < text.length) {
    const opener = openers.find((candidate) => text.startsWith(candidate, index));
    if (opener === undefined) {
      index += 1;
      continue;
    }
    positions.push(index);
    const closer = closers[opener] ?? '\n';
    const end = text.indexOf(closer, index + opener.length);
    index = end === -1 ? text.length : end + closer.length;
  }
  return positions;
}

function commentPositions(text: string, fileName: string): number[] {
  switch (extname(fileName)) {
    case '.ts':
    case '.mjs':
      return typeScriptCommentPositions(text, fileName);
    case '.wgsl':
      return scanDelimited(text, ['//', '/*'], { '//': '\n', '/*': '*/' });
    case '.css':
    case '.scss':
      return scanDelimited(text, ['/*'], { '/*': '*/' });
    case '.html':
      return scanDelimited(text, ['<!--'], { '<!--': '-->' });
    default:
      return [];
  }
}

export function findViolations(fileName: string, text: string): Violation[] {
  const violations: Violation[] = [];
  const extension = extname(fileName);
  if (commentExtensions.has(extension)) {
    for (const position of commentPositions(text, fileName)) {
      violations.push({
        file: fileName,
        line: lineOf(text, position),
        rule: 'comment',
        message: 'comments are not allowed',
      });
    }
  }
  if (dashDetectionApplies(fileName)) {
    text.split('\n').forEach((content, index) => {
      if (dashPattern.test(content)) {
        violations.push({
          file: fileName,
          line: index + 1,
          rule: 'dash',
          message: 'en and em dashes are not allowed',
        });
      }
    });
  }
  return violations;
}

function dashDetectionApplies(fileName: string): boolean {
  return dashExtensions.has(extname(fileName));
}

export function findBoundaryViolations(
  fileName: string,
  text: string,
  excludedFromCoverage: readonly string[],
): Violation[] {
  const normalized = fileName.split(sep).join('/');
  const isSource = normalized.startsWith('src/') && extname(normalized) === '.ts';
  const isSpec = normalized.endsWith('.spec.ts');
  const allowed =
    excludedFromCoverage.includes(normalized) || deviceApiAllowedWithFakes.includes(normalized);
  if (!isSource || isSpec || allowed || !deviceApiPattern.test(text)) {
    return [];
  }
  return [
    {
      file: fileName,
      line: 1,
      rule: 'gpu-boundary',
      message:
        'uses WebGPU entry points but is not on the coverage exclude list in vitest.config.ts',
    },
  ];
}

export function findOwnerViolations(fileName: string, text: string): Violation[] {
  return text.split('\n').flatMap((content, index) =>
    [...content.matchAll(repositoryUrlPattern)]
      .filter((match) => match[1] !== repositoryOwner)
      .map(() => ({
        file: fileName,
        line: index + 1,
        rule: 'repository-owner' as const,
        message: `repository links must use the owner ${repositoryOwner}`,
      })),
  );
}

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function collectFiles(root: string): string[] {
  const directoryFiles = checkedRoots
    .map((name) => join(root, name))
    .filter(isDirectory)
    .flatMap(listFiles);
  const rootFiles = checkedRootFiles.map((name) => join(root, name)).filter(isFile);
  return [...directoryFiles, ...rootFiles].filter(
    (file) => !generatedFragments.some((fragment) => file.includes(fragment)),
  );
}

export function runCheck(root: string): Violation[] {
  return collectFiles(root).flatMap((file) => {
    const relativeName = relative(root, file);
    const text = readFileSync(file, 'utf8');
    return [
      ...findViolations(relativeName, text),
      ...findBoundaryViolations(relativeName, text, gpuDeviceBoundFiles),
      ...findOwnerViolations(relativeName, text),
    ];
  });
}

const invokedDirectly = process.argv[1]?.endsWith('check-style.ts') ?? false;

if (invokedDirectly) {
  const violations = runCheck(process.cwd());
  for (const violation of violations) {
    console.error(
      `${violation.file}:${String(violation.line)} [${violation.rule}] ${violation.message}`,
    );
  }
  console.log(
    violations.length === 0
      ? 'check:style passed'
      : `check:style found ${String(violations.length)} problems`,
  );
  process.exitCode = violations.length === 0 ? 0 : 1;
}
