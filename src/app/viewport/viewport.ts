import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { defaultSettings, type RenderSettings } from '../../core/render/settings';
import { rgbaToPngBase64 } from '../png';
import { downloadPng } from './download';
import { OverlayLegend } from './overlay-legend';
import { RENDER_SESSION_FACTORY, type RenderSession, viewportSize } from './render-session';

export type ViewportState = 'starting' | 'rendered' | 'failed';
export type ExportState = 'idle' | 'working' | 'done' | 'failed';

export const exportEdge = 1024;
export const exportFileName = 'eventhorizon.png';

@Component({
  selector: 'app-viewport',
  imports: [OverlayLegend],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './viewport.html',
  styleUrl: './viewport.css',
})
export class Viewport {
  private readonly startSession = inject(RENDER_SESSION_FACTORY);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly current = signal<ViewportState>('starting');
  private readonly exporting = signal<ExportState>('idle');
  private session: RenderSession | null = null;
  private destroyed = false;

  readonly settings = input<RenderSettings>(defaultSettings);

  protected readonly size = viewportSize;
  protected readonly state = this.current.asReadonly();
  protected readonly exportState = this.exporting.asReadonly();
  protected readonly exportEdge = exportEdge;
  protected readonly inclinationDegrees = computed(() =>
    Math.round((this.settings().view.inclination * 180) / Math.PI),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.session?.destroy();
    });
    afterNextRender(() => {
      void this.start();
    });
    effect(() => {
      const settings = this.settings();
      untracked(() => this.session?.setSettings(settings));
    });
  }

  protected async saveImage(): Promise<void> {
    const session = this.session;
    if (session === null || this.exporting() === 'working') {
      return;
    }
    this.exporting.set('working');
    try {
      const image = await session.exportImage({ width: exportEdge, height: exportEdge });
      downloadPng(await rgbaToPngBase64(image.rgba, image.width, image.height), exportFileName);
      this.exporting.set('done');
    } catch {
      this.exporting.set('failed');
    }
  }

  private async start(): Promise<void> {
    try {
      const session = await this.startSession(
        this.canvas().nativeElement,
        viewportSize,
        untracked(() => this.settings()),
      );
      if (this.destroyed) {
        session.destroy();
        return;
      }
      this.session = session;
      session.setSettings(untracked(() => this.settings()));
      this.current.set('rendered');
    } catch {
      this.current.set('failed');
    }
  }
}
