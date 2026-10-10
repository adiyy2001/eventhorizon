export const accessibilityThreshold = 0.95;
export const formFactors = ['mobile', 'desktop'] as const;
export const categories = ['accessibility', 'best-practices', 'seo', 'performance'] as const;
export const renderers = ['webgpu', 'fallback'] as const;

export type FormFactor = (typeof formFactors)[number];
export type Category = (typeof categories)[number];
export type Renderer = (typeof renderers)[number];

export interface FailedAudit {
  id: string;
  title: string;
  score: number | null;
}

export interface AuditResult {
  renderer: Renderer;
  formFactor: FormFactor;
  scores: Record<Category, number | null>;
  failedAccessibilityAudits: FailedAudit[];
}

export function belowThreshold(results: readonly AuditResult[]): string[] {
  return results
    .filter(({ scores }) => (scores.accessibility ?? 0) < accessibilityThreshold)
    .map(({ renderer, formFactor }) => `${renderer} ${formFactor}`);
}
