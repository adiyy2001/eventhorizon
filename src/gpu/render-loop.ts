import { cameraHash, type RenderSettings, sceneHash } from '../core/render/settings';
import { convergedFrameCount } from './accumulation';
import {
  advanceResolution,
  beginMotion,
  defaultResolutionConfig,
  initialResolutionState,
  type ResolutionConfig,
  type ResolutionLogEntry,
  type ResolutionState,
} from './dynamic-resolution';
import { type GpuMeasurement } from './gpu-timer';
import { type FrameInfo } from './renderer';

export interface LoopRenderer {
  render: (settings: RenderSettings, scale: number) => FrameInfo;
  accumulatedFrames: number;
  framesInFlight: number;
  gpuMeasurement: GpuMeasurement | null;
}

export interface FrameScheduler {
  request: (callback: (time: number) => void) => number;
  cancel: (handle: number) => void;
}

export interface LoopOptions {
  resolution?: ResolutionConfig;
  restFrames?: number;
  maxLogEntries?: number;
  maxFramesInFlight?: number;
  idleAfterFrames?: number;
  onFrame?: (info: FrameInfo, entry: ResolutionLogEntry) => void;
}

export const browserScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => {
    cancelAnimationFrame(handle);
  },
};

const defaultRestFrames = 3;
const defaultMaxFramesInFlight = 2;
const defaultMaxLogEntries = 1200;

export class RenderLoop {
  private readonly config: ResolutionConfig;
  private readonly restFrames: number;
  private readonly maxLogEntries: number;
  private readonly maxFramesInFlight: number;
  private readonly idleAfterFrames: number;
  private resolution: ResolutionState;
  private settings: RenderSettings;
  private lastSceneHash: number | null = null;
  private lastCamera: number | null = null;
  private framesSinceChange = Number.POSITIVE_INFINITY;
  private wasMoving = false;
  private lastTime: number | null = null;
  private handle: number | null = null;
  private frameCounter = 0;
  private dirty = true;
  private readonly entries: ResolutionLogEntry[] = [];

  constructor(
    private readonly renderer: LoopRenderer,
    private readonly scheduler: FrameScheduler,
    initial: RenderSettings,
    private readonly options: LoopOptions = {},
  ) {
    this.config = options.resolution ?? defaultResolutionConfig;
    this.restFrames = options.restFrames ?? defaultRestFrames;
    this.maxLogEntries = options.maxLogEntries ?? defaultMaxLogEntries;
    this.maxFramesInFlight = options.maxFramesInFlight ?? defaultMaxFramesInFlight;
    this.idleAfterFrames = options.idleAfterFrames ?? convergedFrameCount;
    this.resolution = initialResolutionState(this.config);
    this.settings = initial;
  }

  get log(): readonly ResolutionLogEntry[] {
    return this.entries;
  }

  get scale(): number {
    return this.resolution.scale;
  }

  get running(): boolean {
    return this.handle !== null;
  }

  get currentSettings(): RenderSettings {
    return this.settings;
  }

  setSettings(settings: RenderSettings): void {
    this.settings = settings;
    this.dirty = true;
    this.schedule();
  }

  start(): void {
    this.dirty = true;
    this.schedule();
  }

  stop(): void {
    if (this.handle !== null) {
      this.scheduler.cancel(this.handle);
      this.handle = null;
    }
    this.lastTime = null;
  }

  private schedule(): void {
    this.handle ??= this.scheduler.request((time) => {
      this.tick(time);
    });
  }

  private detectMotion(): boolean {
    const hash = sceneHash(this.settings);
    const camera = cameraHash(this.settings);
    const changed = hash !== this.lastSceneHash || camera !== this.lastCamera;
    this.lastSceneHash = hash;
    this.lastCamera = camera;
    if (changed) {
      this.framesSinceChange = 0;
    } else {
      this.framesSinceChange += 1;
    }
    return this.framesSinceChange < this.restFrames;
  }

  private tick(time: number): void {
    this.handle = null;
    if (this.renderer.framesInFlight >= this.maxFramesInFlight) {
      this.lastTime = null;
      this.schedule();
      return;
    }
    const frameMs = this.lastTime === null ? null : time - this.lastTime;
    this.lastTime = time;
    const hadPreviousSettings = this.lastSceneHash !== null;
    const moving = hadPreviousSettings ? this.detectMotion() : this.startMotionState();
    if (moving && !this.wasMoving) {
      this.resolution = beginMotion(this.resolution, this.config);
    }
    this.wasMoving = moving;
    const measurement = this.renderer.gpuMeasurement;
    if (frameMs !== null) {
      this.resolution = advanceResolution(
        this.resolution,
        {
          frameMs,
          gpuMs: measurement?.milliseconds ?? null,
          ...(measurement === null ? {} : { gpuScale: measurement.tag }),
          moving,
        },
        this.config,
      );
    }
    const scale = moving ? this.resolution.scale : this.config.maxScale;
    const converged = this.renderer.accumulatedFrames >= this.idleAfterFrames;
    if (!moving && converged && !this.dirty) {
      this.lastTime = null;
      return;
    }
    this.dirty = false;
    const info = this.renderer.render(this.settings, scale);
    const entry: ResolutionLogEntry = {
      frame: this.frameCounter,
      moving,
      scale,
      frameMs: frameMs ?? 0,
      gpuMs: measurement?.milliseconds ?? null,
    };
    this.frameCounter += 1;
    this.entries.push(entry);
    if (this.entries.length > this.maxLogEntries) {
      this.entries.splice(0, this.entries.length - this.maxLogEntries);
    }
    this.options.onFrame?.(info, entry);
    this.schedule();
  }

  private startMotionState(): boolean {
    this.lastSceneHash = sceneHash(this.settings);
    this.lastCamera = cameraHash(this.settings);
    this.framesSinceChange = this.restFrames;
    return false;
  }
}
