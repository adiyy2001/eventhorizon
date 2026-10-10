import { describe, expect, it } from 'vitest';
import {
  type AuditResult,
  accessibilityThreshold,
  belowThreshold,
  renderers,
} from '../bench/lighthouse-scores.ts';

function result(overrides: Partial<AuditResult>, accessibility: number | null): AuditResult {
  return {
    renderer: 'webgpu',
    formFactor: 'mobile',
    scores: { accessibility, 'best-practices': 1, seo: 1, performance: 1 },
    failedAccessibilityAudits: [],
    ...overrides,
  };
}

describe('belowThreshold', () => {
  it('names nothing when every accessibility score reaches the threshold', () => {
    expect(
      belowThreshold([result({}, accessibilityThreshold), result({ formFactor: 'desktop' }, 1)]),
    ).toEqual([]);
  });

  it('names the renderer and the form factor of every result below it', () => {
    const results = [
      result({ renderer: 'webgpu', formFactor: 'mobile' }, 1),
      result({ renderer: 'fallback', formFactor: 'mobile' }, 0.9),
      result({ renderer: 'fallback', formFactor: 'desktop' }, 0.5),
    ];
    expect(belowThreshold(results)).toEqual(['fallback mobile', 'fallback desktop']);
  });

  it('counts a missing accessibility score as failing', () => {
    expect(belowThreshold([result({ renderer: 'fallback', formFactor: 'desktop' }, null)])).toEqual(
      ['fallback desktop'],
    );
  });

  it('audits both the graphics path and the software path', () => {
    expect([...renderers]).toEqual(['webgpu', 'fallback']);
  });
});
