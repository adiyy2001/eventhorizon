import { describe, expect, it } from 'vitest';
import { findBoundaryViolations, findOwnerViolations, findViolations } from './check-style.ts';

const emDash = String.fromCharCode(0x2014);
const enDash = String.fromCharCode(0x2013);

describe('findViolations', () => {
  it('accepts a clean TypeScript file', () => {
    expect(findViolations('a.ts', 'export const answer = 42;\n')).toEqual([]);
  });

  it('reports line comments, block comments and doc comments', () => {
    const text = [
      'const a = 1; // trailing',
      '/* block */',
      '/** doc */',
      'export function f() {}',
    ].join('\n');
    const lines = findViolations('a.ts', text).map((violation) => violation.line);
    expect(lines).toEqual([1, 2, 3]);
  });

  it('ignores comment markers inside strings and template literals', () => {
    const text =
      'export const url = "http://example.com";\nexport const t = `a // b ${1} /* c */`;\n';
    expect(findViolations('a.ts', text)).toEqual([]);
  });

  it('reports comments in plain JavaScript modules', () => {
    expect(findViolations('a.mjs', 'const x = 1;\n// note\n').map((v) => v.line)).toEqual([2]);
  });

  it('reports comments in WGSL', () => {
    expect(findViolations('a.wgsl', 'fn f() {} // note\n/* x */\n').map((v) => v.line)).toEqual([
      1, 2,
    ]);
  });

  it('reports comments in HTML and CSS', () => {
    expect(findViolations('a.html', '<p>x</p>\n<!-- note -->').map((v) => v.line)).toEqual([2]);
    expect(findViolations('a.css', 'a { color: red; }\n/* note */').map((v) => v.line)).toEqual([
      2,
    ]);
  });

  it('reports en and em dashes in code and prose', () => {
    expect(
      findViolations('a.md', `one ${emDash} two\nthree ${enDash} four`).map((v) => v.rule),
    ).toEqual(['dash', 'dash']);
    expect(findViolations('a.ts', `export const s = 'a${emDash}b';`)).toHaveLength(1);
  });

  it('does not look for comments in markdown', () => {
    expect(findViolations('a.md', '<!-- ADRIAN: question -->')).toEqual([]);
  });
});

describe('findBoundaryViolations', () => {
  const apiCall = 'const module = device.createShaderModule({ code });';

  it('accepts device API calls in excluded files', () => {
    expect(
      findBoundaryViolations('src/gpu/smoke-kernel.ts', apiCall, ['src/gpu/smoke-kernel.ts']),
    ).toEqual([]);
  });

  it('accepts device API calls in specs and outside src', () => {
    expect(findBoundaryViolations('src/gpu/x.spec.ts', apiCall, [])).toEqual([]);
    expect(findBoundaryViolations('e2e/x.ts', apiCall, [])).toEqual([]);
  });

  it('rejects device API calls in counted files', () => {
    const violations = findBoundaryViolations('src/gpu/pure.ts', apiCall, [
      'src/gpu/smoke-kernel.ts',
    ]);
    expect(violations.map((violation) => violation.rule)).toEqual(['gpu-boundary']);
  });

  it('accepts files without device API calls', () => {
    expect(findBoundaryViolations('src/gpu/pure.ts', 'export const x = 1;', [])).toEqual([]);
  });
});

describe('findOwnerViolations', () => {
  const link = (owner: string) => `see https://github.com/${owner}/eventhorizon/blob/main/a.md`;

  it('accepts links to the real owner', () => {
    expect(findOwnerViolations('README.md', link('adiyy2001'))).toEqual([]);
  });

  it('rejects links to any other owner and reports the line', () => {
    const violations = findOwnerViolations('a.ts', `first\n${link('someone-else')}`);
    expect(violations.map((violation) => [violation.rule, violation.line])).toEqual([
      ['repository-owner', 2],
    ]);
  });

  it('ignores links to other repositories', () => {
    expect(findOwnerViolations('a.md', 'https://github.com/someone-else/other')).toEqual([]);
  });
});
