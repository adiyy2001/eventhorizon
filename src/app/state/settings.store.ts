import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {
  defaultSettings,
  mergeSettings,
  type OverlaySettings,
  type RenderSettings,
  sanitizeSettings,
  settingsEqual,
  type SplitSettings,
} from '../../core/render/settings';
import { type ViewDescription } from '../../core/render/view';
import { cameraAnnouncement } from './descriptions';

export interface SettingsChange {
  view?: Partial<ViewDescription>;
  exposure?: number;
  bloomStrength?: number;
  overlays?: Partial<OverlaySettings>;
  split?: Partial<SplitSettings>;
}

interface SettingsState {
  settings: RenderSettings;
  announcement: string;
}

const fullTurn = 2 * Math.PI;

export function wrapAzimuth(azimuth: number): number {
  const wrapped = azimuth % fullTurn;
  if (wrapped > Math.PI) {
    return wrapped - fullTurn;
  }
  return wrapped < -Math.PI ? wrapped + fullTurn : wrapped;
}

export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState<SettingsState>({ settings: defaultSettings, announcement: '' }),
  withComputed(({ settings }) => ({
    view: computed(() => settings().view),
    overlays: computed(() => settings().overlays),
    split: computed(() => settings().split),
    isDefault: computed(() => settingsEqual(settings(), defaultSettings)),
  })),
  withMethods((store) => ({
    update(change: SettingsChange): void {
      patchState(store, { settings: mergeSettings(store.settings(), change) });
    },
    orbit(azimuth: number, inclination: number): void {
      const { view } = store.settings();
      patchState(store, {
        settings: mergeSettings(store.settings(), {
          view: {
            azimuth: wrapAzimuth(view.azimuth + azimuth),
            inclination: view.inclination + inclination,
          },
        }),
      });
    },
    zoom(factor: number): void {
      patchState(store, {
        settings: mergeSettings(store.settings(), {
          view: { distance: store.settings().view.distance * factor },
        }),
      });
    },
    replace(settings: unknown): void {
      patchState(store, { settings: sanitizeSettings(settings) });
    },
    reset(): void {
      patchState(store, { settings: defaultSettings });
    },
    announce(message: string): void {
      patchState(store, { announcement: message });
    },
    announceCamera(): void {
      patchState(store, { announcement: cameraAnnouncement(store.settings()) });
    },
  })),
);
