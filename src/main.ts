import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { browserWorkerPorts } from './app/fallback/worker-factory';

if (new URLSearchParams(window.location.search).has('automation')) {
  void import('./app/automation').then((module) => {
    module.installAutomation(window, {
      ...module.defaultDependencies,
      workerPorts: browserWorkerPorts,
    });
  });
}

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  console.error(error);
});
