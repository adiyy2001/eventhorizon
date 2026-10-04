import { InjectionToken } from '@angular/core';
import { type ViewDescription } from '../../core/render/view';
import { acquireDevice, type DeviceResult } from '../../gpu/device';
import { Renderer } from '../../gpu/renderer';

export interface RenderSession {
  destroy: () => void;
}

export type RenderSessionFactory = (
  canvas: HTMLCanvasElement,
  size: number,
  view: ViewDescription,
) => Promise<RenderSession>;

export const viewportSize = 512;

export interface SessionDependencies {
  acquire: () => Promise<DeviceResult>;
  createRenderer: (
    device: GPUDevice,
    size: { width: number; height: number },
    canvas: HTMLCanvasElement,
  ) => Promise<{ render: (view: ViewDescription) => void; destroy: () => void }>;
}

const defaultDependencies: SessionDependencies = {
  acquire: () => acquireDevice(),
  createRenderer: (device, size, canvas) => Renderer.create(device, size, canvas),
};

export async function startRenderSession(
  canvas: HTMLCanvasElement,
  size: number,
  view: ViewDescription,
  dependencies: SessionDependencies = defaultDependencies,
): Promise<RenderSession> {
  const acquired = await dependencies.acquire();
  if (acquired.status === 'unsupported') {
    throw new Error(acquired.detail);
  }
  const renderer = await dependencies.createRenderer(
    acquired.device,
    { width: size, height: size },
    canvas,
  );
  renderer.render(view);
  await acquired.device.queue.onSubmittedWorkDone();
  return {
    destroy: () => {
      renderer.destroy();
      acquired.device.destroy();
    },
  };
}

export const RENDER_SESSION_FACTORY = new InjectionToken<RenderSessionFactory>(
  'RENDER_SESSION_FACTORY',
  {
    providedIn: 'root',
    factory: () => (canvas, size, view) => startRenderSession(canvas, size, view),
  },
);
