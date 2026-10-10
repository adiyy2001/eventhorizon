import { type ViewportSize } from '../../core/physics/observer';
import { cpuRenderKey } from '../../core/render/cpu-frame';
import { type DisplayQuality, FrameAssembler } from '../../core/render/frame-assembler';
import { type RenderSettings, settingsEqual } from '../../core/render/settings';
import { RenderJob, type TileRequest } from '../../core/render/tile-scheduler';
import { type WorkerResponse } from '../../workers/protocol';
import { type RenderProgress } from '../viewport/render-session';
import { type WorkerPort, type WorkerPortFactory } from './worker-port';

export interface RendererClock {
  now: () => number;
  schedule: (callback: () => void, delayMilliseconds: number) => number;
  cancel: (handle: number) => void;
}

export const browserClock: RendererClock = {
  now: () => performance.now(),
  schedule: (callback, delayMilliseconds) => window.setTimeout(callback, delayMilliseconds),
  cancel: (handle) => {
    window.clearTimeout(handle);
  },
};

export interface CpuFrame {
  generation: number;
  size: ViewportSize;
  quality: DisplayQuality;
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

export interface CpuRendererListener {
  frame: (frame: CpuFrame) => void;
  progress: (progress: RenderProgress) => void;
  failure: (detail: string) => void;
}

export interface CpuRendererOptions {
  ports: WorkerPortFactory;
  workerCount: number;
  size: ViewportSize;
  clock: RendererClock;
  listener: CpuRendererListener;
}

interface WorkerSlot {
  port: WorkerPort;
  inFlight: number;
}

export const tilesInFlightPerWorker = 2;
export const minimumDisplayInterval = 48;
export const displayCostFactor = 2;

export function displayDelay(now: number, lastDisplayEnd: number, lastDisplayCost: number): number {
  const interval = Math.max(minimumDisplayInterval, displayCostFactor * lastDisplayCost);
  return Math.max(0, lastDisplayEnd + interval - now);
}

export class CpuRenderer {
  private readonly slots: WorkerSlot[];
  private settings: RenderSettings | null = null;
  private renderKey: string | null = null;
  private job: RenderJob | null = null;
  private assembler: FrameAssembler | null = null;
  private generation = 0;
  private startedAt = 0;
  private firstImageMilliseconds: number | null = null;
  private fullImageMilliseconds: number | null = null;
  private heldBack = false;
  private hasShownFrame = false;
  private undisplayed = false;
  private displayTimer: number | null = null;
  private lastDisplayEnd = Number.NEGATIVE_INFINITY;
  private lastDisplayCost = 0;
  private stopped = false;

  constructor(private readonly options: CpuRendererOptions) {
    this.slots = Array.from({ length: options.workerCount }, () => this.openSlot());
  }

  get settled(): boolean {
    return (
      !this.stopped && !this.undisplayed && !this.heldBack && this.job?.progress().complete === true
    );
  }

  setSettings(settings: RenderSettings): void {
    if (this.stopped || (this.settings !== null && settingsEqual(this.settings, settings))) {
      return;
    }
    this.settings = settings;
    const key = cpuRenderKey(settings, this.options.size);
    if (key === this.renderKey) {
      this.undisplayed = true;
      this.scheduleDisplay();
    } else {
      this.renderKey = key;
      this.begin();
    }
  }

  destroy(): void {
    this.stop();
  }

  private openSlot(): WorkerSlot {
    const slot: WorkerSlot = { port: this.options.ports(), inFlight: 0 };
    slot.port.onResponse((response) => {
      this.receive(slot, response);
    });
    slot.port.onFailure((detail) => {
      this.fail(detail);
    });
    return slot;
  }

  private begin(): void {
    this.cancelDisplayTimer();
    this.generation += 1;
    this.job = new RenderJob(this.generation, this.options.size);
    this.assembler = new FrameAssembler(this.options.size);
    this.heldBack = this.hasShownFrame;
    this.undisplayed = false;
    this.startedAt = this.options.clock.now();
    this.firstImageMilliseconds = null;
    this.fullImageMilliseconds = null;
    this.pump();
    this.emitProgress();
  }

  private pump(): void {
    const { job, settings } = this;
    if (this.stopped || job === null || settings === null) {
      return;
    }
    let posted = true;
    while (posted) {
      posted = false;
      for (const slot of this.slots) {
        if (slot.inFlight >= tilesInFlightPerWorker) {
          continue;
        }
        const tile = job.nextTile();
        if (tile === null) {
          return;
        }
        slot.inFlight += 1;
        slot.port.post({
          type: 'render-tile',
          generation: job.generation,
          settings,
          size: this.options.size,
          tile,
        });
        posted = true;
      }
    }
  }

  private receive(slot: WorkerSlot, response: WorkerResponse): void {
    if (this.stopped) {
      return;
    }
    if (response.type === 'request-rejected') {
      this.fail(response.detail);
      return;
    }
    slot.inFlight = Math.max(0, slot.inFlight - 1);
    if (response.type === 'tile-failed') {
      this.fail(response.detail);
      return;
    }
    const { job, assembler } = this;
    if (job === null || assembler === null || response.generation !== job.generation) {
      this.pump();
      return;
    }
    try {
      assembler.applyTile(response.tile, response.samples);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      return;
    }
    job.tileFinished(response.tile);
    this.undisplayed = true;
    this.afterTile(response.tile, job);
    this.pump();
  }

  private afterTile(tile: TileRequest, job: RenderJob): void {
    const firstPassDone = job.passComplete(0);
    if (firstPassDone) {
      this.heldBack = false;
    }
    if (job.progress().complete) {
      this.show('final', job);
    } else if (firstPassDone && job.passComplete(tile.pass)) {
      this.show('preview', job);
    } else if (!this.heldBack) {
      this.scheduleDisplay();
    }
    this.emitProgress();
  }

  private scheduleDisplay(): void {
    if (this.displayTimer !== null || this.heldBack || this.job === null) {
      return;
    }
    const wait = displayDelay(this.options.clock.now(), this.lastDisplayEnd, this.lastDisplayCost);
    this.displayTimer = this.options.clock.schedule(() => {
      this.displayTimer = null;
      this.flush();
    }, wait);
  }

  private flush(): void {
    const job = this.job;
    if (this.stopped || job === null || this.heldBack || !this.undisplayed) {
      return;
    }
    this.show(job.progress().complete ? 'final' : 'preview', job);
    this.emitProgress();
  }

  private show(quality: DisplayQuality, job: RenderJob): void {
    const { assembler, settings } = this;
    if (assembler === null || settings === null) {
      return;
    }
    this.cancelDisplayTimer();
    const started = this.options.clock.now();
    const pixels = assembler.display(settings, quality);
    const finished = this.options.clock.now();
    this.lastDisplayCost = finished - started;
    this.lastDisplayEnd = finished;
    this.undisplayed = false;
    this.hasShownFrame = true;
    this.options.listener.frame({
      generation: job.generation,
      size: this.options.size,
      quality,
      pixels,
    });
    const elapsed = finished - this.startedAt;
    if (job.passComplete(0)) {
      this.firstImageMilliseconds ??= elapsed;
    }
    if (quality === 'final' && job.progress().complete) {
      this.fullImageMilliseconds ??= elapsed;
    }
  }

  private emitProgress(): void {
    const job = this.job;
    if (job === null) {
      return;
    }
    const progress = job.progress();
    this.options.listener.progress({
      generation: progress.generation,
      passesDone: progress.passesDone,
      passesTotal: progress.passesTotal,
      fraction: progress.tilesTotal === 0 ? 1 : progress.tilesDone / progress.tilesTotal,
      complete: progress.complete,
      firstImageMilliseconds: this.firstImageMilliseconds,
      fullImageMilliseconds: this.fullImageMilliseconds,
    });
  }

  private cancelDisplayTimer(): void {
    if (this.displayTimer !== null) {
      this.options.clock.cancel(this.displayTimer);
      this.displayTimer = null;
    }
  }

  private fail(detail: string): void {
    if (this.stopped) {
      return;
    }
    this.stop();
    this.options.listener.failure(detail);
  }

  private stop(): void {
    this.stopped = true;
    this.cancelDisplayTimer();
    this.slots.forEach((slot) => {
      slot.port.terminate();
    });
  }
}
