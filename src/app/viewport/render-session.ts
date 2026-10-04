import { InjectionToken } from '@angular/core';
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

export interface RenderSession {
  setSettings: (settings: RenderSettings) => void;
  exportImage: (request: ExportRequest) => Promise<CapturedImage>;
  resolutionLog: () => readonly ResolutionLogEntry[];
  destroy: () => void;
}

export type RenderSessionFactory = (
  canvas: HTMLCanvasElement,
  size: number,
  settings: RenderSettings,
) => Promise<RenderSession>;

export const viewportSize = 512;
export const automationIdleFrames = 4;

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
  const renderer = await dependencies.createRenderer(acquired.device, canvasSize, canvas);
  renderer.render(settings, 1);
  await acquired.device.queue.onSubmittedWorkDone();
  const loop = new RenderLoop(renderer, dependencies.scheduler, settings, {
    ...(dependencies.idleAfterFrames === undefined
      ? {}
      : { idleAfterFrames: dependencies.idleAfterFrames }),
  });
  loop.start();
  return {
    setSettings: (next) => {
      loop.setSettings(next);
    },
    exportImage: (request) =>
      dependencies.renderStill(
        acquired.device,
        renderer.sky,
        {
          settings: loop.currentSettings,
          size: { width: request.width, height: request.height },
          ...(request.frames === undefined ? {} : { frames: request.frames }),
        },
        canvasSize,
      ),
    resolutionLog: () => loop.log,
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
