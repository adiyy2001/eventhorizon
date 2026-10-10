import { portForWorker, type WorkerPortFactory } from './worker-port';

export const browserWorkerPorts: WorkerPortFactory = () =>
  portForWorker(
    new Worker(new URL('../../workers/cpu-render.worker', import.meta.url), { type: 'module' }),
  );
