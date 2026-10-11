import { InjectionToken, type Signal, signal } from '@angular/core';
import { type RenderSettings } from '../../core/render/settings';
import { acquireDevice, type DeviceResult } from '../../gpu/device';
import { type ResolutionLogEntry } from '../../gpu/dynamic-resolution';
import {
  browserScheduler,
  type FrameScheduler,
  type LoopRenderer,
  RenderLoop,
} from '../../gpu/render-loop';
import { type CapturedImage, Renderer } from '../../gpu/renderer';
import { type SkyResources } from '../../gpu/sky-resources';
import { renderStill } from '../../gpu/still';

export interface ExportRequest {
  width: number;
  height: number;
  frames?: number;
}

export interface RenderProgress {
  generation: number;
  passesDone: number;
  passesTotal: number;
  fraction: number;
  complete: boolean;
  firstImageMilliseconds: number | null;
  fullImageMilliseconds: number | null;
}

export interface RenderSession {
  setSettings: (settings: RenderSettings) => void;
  exportImage: (request: ExportRequest) => Promise<CapturedImage>;
  resolutionLog: () => readonly ResolutionLogEntry[];
  progress: Signal<RenderProgress | null>;
  failure: Signal<string | null>;
  destroy: () => void;
}

export type RenderSessionFactory = (
  canvas: HTMLCanvasElement,
  size: number,
  settings: RenderSettings,
) => Promise<RenderSession>;

export const viewportSize = 512;
export const automationIdleFrames = 4;
const deviceLostMessage = 'the graphics device was lost';

export interface SessionRenderer extends LoopRenderer {
  sky: SkyResources;
  destroy: () => void;
}

export interface SessionDependencies {
  acquire: () => Promise<DeviceResult>;
  createRenderer: (
    device: GPUDevice,
    size: { width: number; height: number },
    canvas: HTMLCanvasElement,
  ) => Promise<SessionRenderer>;
  renderStill: (
    device: GPUDevice,
    sky: SkyResources,
    request: { settings: RenderSettings; size: { width: number; height: number }; frames?: number },
    fallback: { width: number; height: number },
  ) => Promise<CapturedImage>;
  scheduler: FrameScheduler;
  idleAfterFrames?: number;
}

function automationRequested(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('automation');
}

const defaultDependencies = (): SessionDependencies => ({
  acquire: () => acquireDevice(),
  createRenderer: (device, size, canvas) => Renderer.create(device, size, canvas),
  renderStill,
  scheduler: browserScheduler,
  ...(automationRequested() ? { idleAfterFrames: automationIdleFrames } : {}),
});

export async function startRenderSession(
  canvas: HTMLCanvasElement,
  size: number,
  settings: RenderSettings,
  dependencies: SessionDependencies = defaultDependencies(),
): Promise<RenderSession> {
  const acquired = await dependencies.acquire();
  if (acquired.status === 'unsupported') {
    throw new Error(acquired.detail);
  }
  const canvasSize = { width: size, height: size };
  const failure = signal<string | null>(null);
  void acquired.device.lost.then((info) => {
    if (info.reason !== 'destroyed') {
      failure.set(info.message === '' ? deviceLostMessage : info.message);
    }
  });
  const renderer = await dependencies.createRenderer(acquired.device, canvasSize, canvas);
  renderer.render(settings, 1);
  await acquired.device.queue.onSubmittedWorkDone();
  const loop = new RenderLoop(renderer, dependencies.scheduler, settings, {
    ...(dependencies.idleAfterFrames === undefined
      ? {}
      : { idleAfterFrames: dependencies.idleAfterFrames }),
  });
  loop.start();
  let runningExports = 0;
  let resumeAfterExports = false;
  return {
    setSettings: (next) => {
      loop.setSettings(next);
      if (runningExports > 0) {
        loop.stop();
        resumeAfterExports = true;
      }
    },
    exportImage: async (request) => {
      if (runningExports === 0) {
        resumeAfterExports = loop.running;
        loop.stop();
      }
      runningExports += 1;
      try {
        return await dependencies.renderStill(
          acquired.device,
          renderer.sky,
          {
            settings: loop.currentSettings,
            size: { width: request.width, height: request.height },
            ...(request.frames === undefined ? {} : { frames: request.frames }),
          },
          canvasSize,
        );
      } finally {
        runningExports -= 1;
        if (runningExports === 0 && resumeAfterExports) {
          resumeAfterExports = false;
          loop.start();
        }
      }
    },
    resolutionLog: () => loop.log,
    progress: signal<RenderProgress | null>(null).asReadonly(),
    failure: failure.asReadonly(),
    destroy: () => {
      loop.stop();
      renderer.destroy();
      acquired.device.destroy();
    },
  };
}

export const RENDER_SESSION_FACTORY = new InjectionToken<RenderSessionFactory>(
  'RENDER_SESSION_FACTORY',
  {
    providedIn: 'root',
    factory: () => (canvas, size, settings) => startRenderSession(canvas, size, settings),
  },
);
