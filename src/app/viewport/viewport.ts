import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { defaultView } from '../../core/render/view';
import { RENDER_SESSION_FACTORY, type RenderSession, viewportSize } from './render-session';

export type ViewportState = 'starting' | 'rendered' | 'failed';

@Component({
  selector: 'app-viewport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './viewport.html',
  styleUrl: './viewport.css',
})
export class Viewport {
  private readonly startSession = inject(RENDER_SESSION_FACTORY);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly current = signal<ViewportState>('starting');
  private session: RenderSession | null = null;
  private destroyed = false;

  protected readonly size = viewportSize;
  protected readonly state = this.current.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.session?.destroy();
    });
    afterNextRender(() => {
      void this.start();
    });
  }

  private async start(): Promise<void> {
    try {
      const session = await this.startSession(
        this.canvas().nativeElement,
        viewportSize,
        defaultView,
      );
      if (this.destroyed) {
        session.destroy();
        return;
      }
      this.session = session;
      this.current.set('rendered');
    } catch {
      this.current.set('failed');
    }
  }
}
