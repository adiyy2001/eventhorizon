import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { browserWorkerPorts } from './fallback/worker-factory';
import { CPU_WORKER_PORTS } from './fallback/worker-port';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: CPU_WORKER_PORTS, useValue: browserWorkerPorts },
  ],
};
