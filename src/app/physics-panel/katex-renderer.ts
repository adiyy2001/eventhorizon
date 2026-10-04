import { Injectable, signal } from '@angular/core';

export type LatexRenderer = (latex: string) => string;

export const katexOptions = {
  displayMode: true,
  output: 'htmlAndMathml',
  throwOnError: true,
  trust: false,
} as const;

@Injectable({ providedIn: 'root' })
export class KatexRenderer {
  private readonly loaded = signal<LatexRenderer | null>(null);
  private loading: Promise<void> | null = null;
  readonly renderer = this.loaded.asReadonly();

  load(): Promise<void> {
    this.loading ??= import('katex').then(({ default: katex }) => {
      this.loaded.set((latex) => katex.renderToString(latex, katexOptions));
    });
    return this.loading;
  }
}
