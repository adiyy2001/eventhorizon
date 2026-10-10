import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  cpuSupportedSettings,
  defaultSettings,
  type RenderSettings,
} from '../../core/render/settings';
import { CPU_SESSION_FACTORY } from '../fallback/cpu-session';
import { type GpuFailure } from '../gpu-status';
import { canvasDescription } from '../state/descriptions';
import {
  type GestureDelta,
  gestureModeAt,
  PointerGestures,
  type PointerSample,
} from '../state/pointer-gestures';
import { rgbaToPngBase64 } from '../png';
import { downloadPng } from './download';
import { OverlayLegend } from './overlay-legend';
import {
  RENDER_SESSION_FACTORY,
  type RenderProgress,
  type RenderSession,
  viewportSize,
} from './render-session';

export type ViewportBackend = 'gpu' | 'cpu';
export type ViewportState = 'starting' | 'rendered' | 'failed';
export type ExportState = 'idle' | 'working' | 'done' | 'failed';

export const exportEdge = 1024;
export const exportFileName = 'eventhorizon.png';

function roundedOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function seconds(milliseconds: number | null): string {
  return ((milliseconds ?? 0) / 1000).toFixed(1);
}

export function progressSentence(progress: RenderProgress | null): string {
  if (progress === null) {
    return '';
  }
  if (progress.complete) {
    return `Full resolution after ${seconds(progress.fullImageMilliseconds)} s, first image after ${seconds(progress.firstImageMilliseconds)} s.`;
  }
  const pass = Math.min(progress.passesDone + 1, progress.passesTotal);
  return `Refining, pass ${String(pass)} of ${String(progress.passesTotal)}.`;
}

@Component({
  selector: 'app-viewport',
  imports: [OverlayLegend],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './viewport.html',
  styleUrl: './viewport.css',
})
export class Viewport {
  private readonly injector = inject(Injector);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly current = signal<ViewportState>('starting');
  private readonly exporting = signal<ExportState>('idle');
  private readonly activeSession = signal<RenderSession | null>(null);
  private readonly failureText = signal('');
  private destroyed = false;
  private readonly gestures = new PointerGestures();

  readonly settings = input<RenderSettings>(defaultSettings);
  readonly backend = input<ViewportBackend>('gpu');
  readonly gesture = output<GestureDelta>();
  readonly gpuFailed = output<GpuFailure>();

  protected readonly size = viewportSize;
  protected readonly state = this.current.asReadonly();
  protected readonly exportState = this.exporting.asReadonly();
  protected readonly failureDetail = this.failureText.asReadonly();
  protected readonly saveEdge = computed(() =>
    this.backend() === 'cpu' ? viewportSize : exportEdge,
  );
  protected readonly shownSettings = computed(() =>
    this.backend() === 'cpu' ? cpuSupportedSettings(this.settings()) : this.settings(),
  );
  protected readonly description = computed(() => canvasDescription(this.shownSettings()));
  protected readonly inclinationDegrees = computed(() =>
    Math.round((this.settings().view.inclination * 180) / Math.PI),
  );
  protected readonly progress = computed<RenderProgress | null>(
    () => this.activeSession()?.progress() ?? null,
  );
  protected readonly progressText = computed(() => progressSentence(this.progress()));
  protected readonly firstImageMilliseconds = computed(() =>
    roundedOrNull(this.progress()?.firstImageMilliseconds ?? null),
  );
  protected readonly fullImageMilliseconds = computed(() =>
    roundedOrNull(this.progress()?.fullImageMilliseconds ?? null),
  );
  private readonly sessionFailure = computed(() => this.activeSession()?.failure() ?? null);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.activeSession()?.destroy();
    });
    afterNextRender(() => {
      void this.start();
    });
    effect(() => {
      const settings = this.settings();
      untracked(() => this.activeSession()?.setSettings(settings));
    });
    effect(() => {
      const detail = this.sessionFailure();
      if (detail !== null) {
        untracked(() => {
          this.fail('device-lost', detail);
        });
      }
    });
  }

  protected onPointerDown(event: PointerEvent): void {
    const canvas = this.canvas().nativeElement;
    const sample = this.sampleOf(event);
    this.gestures.down(
      event.pointerId,
      sample,
      gestureModeAt(sample.fractionX, this.settings().split),
    );
    canvas.setPointerCapture(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    const delta = this.gestures.move(event.pointerId, this.sampleOf(event));
    if (delta !== null) {
      this.gesture.emit(delta);
    }
  }

  protected onPointerEnd(event: PointerEvent): void {
    this.gestures.up(event.pointerId);
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const lineHeight = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    this.gesture.emit(this.gestures.wheel(event.deltaY * lineHeight));
  }

  protected async saveImage(): Promise<void> {
    const session = this.activeSession();
    if (session === null || this.exporting() === 'working') {
      return;
    }
    this.exporting.set('working');
    try {
      const edge = this.saveEdge();
      const image = await session.exportImage({ width: edge, height: edge });
      downloadPng(await rgbaToPngBase64(image.rgba, image.width, image.height), exportFileName);
      this.exporting.set('done');
    } catch {
      this.exporting.set('failed');
    }
  }

  private async start(): Promise<void> {
    try {
      const startSession = this.injector.get(
        this.backend() === 'cpu' ? CPU_SESSION_FACTORY : RENDER_SESSION_FACTORY,
      );
      const session = await startSession(
        this.canvas().nativeElement,
        viewportSize,
        untracked(() => this.settings()),
      );
      if (this.destroyed) {
        session.destroy();
        return;
      }
      this.activeSession.set(session);
      session.setSettings(untracked(() => this.settings()));
      this.current.set('rendered');
    } catch (error) {
      this.fail('render-failed', error instanceof Error ? error.message : String(error));
    }
  }

  private fail(reason: GpuFailure['reason'], detail: string): void {
    this.current.set('failed');
    this.failureText.set(detail);
    if (this.backend() === 'gpu') {
      this.gpuFailed.emit({ reason, detail });
    }
  }

  private sampleOf(event: PointerEvent): PointerSample {
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    return {
      x: event.clientX,
      y: event.clientY,
      fractionX: rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5,
    };
  }
}
