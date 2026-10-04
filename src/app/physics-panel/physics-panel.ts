import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Equation } from './equation';
import { physicsDocumentUrl, physicsEquations } from './equations';
import { KatexRenderer } from './katex-renderer';

@Component({
  selector: 'app-physics-panel',
  imports: [Equation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './physics-panel.html',
  styleUrl: './physics-panel.css',
})
export class PhysicsPanel {
  private readonly katex = inject(KatexRenderer);
  protected readonly equations = physicsEquations;
  protected readonly documentUrl = physicsDocumentUrl;
  protected readonly ready = this.katex.renderer;

  constructor() {
    void this.katex.load();
  }
}
