import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { KatexRenderer } from './katex-renderer';

@Component({
  selector: 'app-equation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  styleUrl: './equation.css',
  host: {
    'data-state': 'pending',
    tabindex: '0',
    role: 'group',
    '[attr.aria-label]': 'label()',
  },
})
export class Equation {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly katex = inject(KatexRenderer);

  readonly latex = input.required<string>();
  readonly label = input.required<string>();

  constructor() {
    effect(() => {
      const render = this.katex.renderer();
      if (render === null) {
        return;
      }
      const element = this.host.nativeElement;
      try {
        element.innerHTML = render(this.latex());
        element.dataset['state'] = 'rendered';
      } catch {
        element.textContent = this.latex();
        element.dataset['state'] = 'failed';
      }
    });
  }
}
