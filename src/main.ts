import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

if (new URLSearchParams(window.location.search).has('automation')) {
  void import('./app/automation').then((module) => {
    module.installAutomation();
  });
}

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  console.error(error);
});
