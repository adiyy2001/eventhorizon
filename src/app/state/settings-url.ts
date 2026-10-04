import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject, Injectable } from '@angular/core';
import { type RenderSettings } from '../../core/render/settings';
import { decodeSettings, settingsQuery } from '../../core/render/url-codec';
import { SettingsStore } from './settings.store';

export const urlWriteDelayMilliseconds = 150;

@Injectable({ providedIn: 'root' })
export class SettingsUrl {
  private readonly document = inject(DOCUMENT);
  private readonly store = inject(SettingsStore);

  constructor() {
    this.store.replace(decodeSettings(this.document.location.search));
    effect((onCleanup) => {
      const settings = this.store.settings();
      const timer = setTimeout(() => {
        this.write(settings);
      }, urlWriteDelayMilliseconds);
      onCleanup(() => {
        clearTimeout(timer);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.write(this.store.settings());
    });
  }

  private write(settings: RenderSettings): void {
    const { location, defaultView } = this.document;
    const next = settingsQuery(location.search, settings);
    if (next !== location.search && defaultView !== null) {
      defaultView.history.replaceState(
        defaultView.history.state,
        '',
        `${location.pathname}${next}${location.hash}`,
      );
    }
  }
}
