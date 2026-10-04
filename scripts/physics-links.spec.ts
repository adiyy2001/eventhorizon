import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { githubAnchor, physicsEquations } from '../src/app/physics-panel/equations.ts';

const document = readFileSync('docs/physics.md', 'utf8');
const headings = document
  .split('\n')
  .filter((line) => line.startsWith('## '))
  .map((line) => line.slice(3));

describe('physics panel links', () => {
  it('points every equation at a section that exists in docs/physics.md', () => {
    for (const equation of physicsEquations) {
      expect(headings, equation.id).toContain(equation.section.heading);
      expect(equation.section.anchor).toBe(githubAnchor(equation.section.heading));
    }
  });

  it('keeps the section anchors unique in the document', () => {
    const anchors = headings.map(githubAnchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });
});
