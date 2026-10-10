import { inject, InjectionToken, signal } from '@angular/core';
import { cpuSupportedSettings, type RenderSettings } from '../../core/render/settings';
import { poolSize } from '../../core/render/tile-scheduler';
import { type CapturedImage } from '../../gpu/renderer';
import {
  type RenderProgress,
  type RenderSession,
  type RenderSessionFactory,
} from '../viewport/render-session';
import { browserClock, type CpuFrame, CpuRenderer, type RendererClock } from './cpu-renderer';
import { CPU_WORKER_PORTS, type WorkerPortFactory } from './worker-port';

export interface CpuSessionDependencies {
  ports: WorkerPortFactory;
  workerCount: number;
  clock: RendererClock;
}

interface ExportWaiter {
  resolve: (image: CapturedImage) => void;
  reject: (reason: Error) => void;
}

const sessionStoppedMessage = 'the software renderer stopped';

function capturedImage(frame: CpuFrame): CapturedImage {
  const { pixels, size } = frame;
  return {
    width: size.width,
    height: size.height,
    rgba: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
  };
}

export function startCpuSession(
  canvas: HTMLCanvasElement,
  size: number,
  settings: RenderSettings,
  dependencies: CpuSessionDependencies,
): RenderSession {
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('the canvas does not provide a 2D drawing context');
  }
  const progress = signal<RenderProgress | null>(null);
  const failure = signal<string | null>(null);
  const waiters: ExportWaiter[] = [];
  let latest: CpuFrame | null = null;

  const settleWaiters = (settle: (waiter: ExportWaiter) => void): void => {
    waiters.splice(0).forEach(settle);
  };

  const renderer = new CpuRenderer({
    ports: dependencies.ports,
    workerCount: dependencies.workerCount,
    size: { width: size, height: size },
    clock: dependencies.clock,
    listener: {
      frame: (frame) => {
        context.putImageData(
          new ImageData(frame.pixels, frame.size.width, frame.size.height),
          0,
          0,
        );
        latest = frame;
        if (frame.quality === 'final') {
          settleWaiters((waiter) => {
            waiter.resolve(capturedImage(frame));
          });
        }
      },
      progress: (next) => {
        progress.set(next);
      },
      failure: (detail) => {
        failure.set(detail);
        settleWaiters((waiter) => {
          waiter.reject(new Error(detail));
        });
      },
    },
  });
  renderer.setSettings(cpuSupportedSettings(settings));

  return {
    setSettings: (next) => {
      renderer.setSettings(cpuSupportedSettings(next));
    },
    exportImage: () =>
      new Promise<CapturedImage>((resolve, reject) => {
        const failed = failure();
        if (failed !== null) {
          reject(new Error(failed));
        } else if (renderer.settled && latest !== null) {
          resolve(capturedImage(latest));
        } else {
          waiters.push({ resolve, reject });
        }
      }),
    resolutionLog: () => [],
    progress: progress.asReadonly(),
    failure: failure.asReadonly(),
    destroy: () => {
      renderer.destroy();
      settleWaiters((waiter) => {
        waiter.reject(new Error(sessionStoppedMessage));
      });
    },
  };
}

export const CPU_SESSION_FACTORY = new InjectionToken<RenderSessionFactory>('CPU_SESSION_FACTORY', {
  providedIn: 'root',
  factory: () => {
    const ports = inject(CPU_WORKER_PORTS);
    return (canvas, size, settings) =>
      new Promise((resolve) => {
        resolve(
          startCpuSession(canvas, size, settings, {
            ports,
            workerCount: poolSize(navigator.hardwareConcurrency),
            clock: browserClock,
          }),
        );
      });
  },
});
