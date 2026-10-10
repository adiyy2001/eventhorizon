import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ControlPanel } from './controls/control-panel';
import { FallbackBanner } from './fallback/fallback-banner';
import { type GpuFailure, GpuStatus, unsupportedMessages } from './gpu-status';
import { KeyboardHelp } from './help/keyboard-help';
import { PhysicsPanel } from './physics-panel/physics-panel';
import { commandForKey } from './state/keyboard-map';
import { type GestureDelta } from './state/pointer-gestures';
import { SettingsStore } from './state/settings.store';
import { SettingsUrl } from './state/settings-url';
import { Viewport } from './viewport/viewport';

export type SidebarView = 'controls' | 'physics';

@Component({
  selector: 'app-root',
  imports: [ControlPanel, FallbackBanner, KeyboardHelp, PhysicsPanel, Viewport],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '(window:keydown)': 'onKeydown($event)' },
})
export class App {
  private readonly gpuStatus = inject(GpuStatus);
  protected readonly store = inject(SettingsStore);
  protected readonly state = this.gpuStatus.state;
  protected readonly backend = this.gpuStatus.backend;
  protected readonly sidebarView = signal<SidebarView>('controls');
  protected readonly helpOpen = signal(false);
  protected readonly sheetOpen = signal(false);
  protected readonly unsupportedMessage = computed(() => {
    const state = this.state();
    return state.status === 'unsupported' ? unsupportedMessages[state.reason] : '';
  });
  protected readonly unsupportedDetail = computed(() => {
    const state = this.state();
    return state.status === 'unsupported' ? state.detail : '';
  });

  constructor() {
    inject(SettingsUrl);
  }

  protected showView(view: SidebarView): void {
    this.sidebarView.set(view);
  }

  protected toggleSheet(): void {
    this.sheetOpen.update((open) => !open);
  }

  protected openHelp(): void {
    this.sidebarView.set('controls');
    this.sheetOpen.set(true);
    this.helpOpen.set(true);
  }

  protected closeHelp(): void {
    this.helpOpen.set(false);
  }

  protected onGpuFailed(failure: GpuFailure): void {
    this.gpuStatus.reportFailure(failure);
  }

  protected onGesture(delta: GestureDelta): void {
    switch (delta.kind) {
      case 'orbit':
        this.store.orbit(delta.azimuth, delta.inclination);
        break;
      case 'zoom':
        this.store.zoom(delta.factor);
        break;
      case 'split':
        this.store.update({ split: { position: delta.position } });
        break;
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === 'Escape' && this.helpOpen()) {
      this.helpOpen.set(false);
      return;
    }
    const command = commandForKey(event);
    if (command === null || this.backend() === 'checking') {
      return;
    }
    event.preventDefault();
    switch (command.kind) {
      case 'orbit':
        this.store.orbit(command.azimuth, command.inclination);
        this.store.announceCamera();
        break;
      case 'zoom':
        this.store.zoom(command.factor);
        this.store.announceCamera();
        break;
      case 'reset':
        this.store.reset();
        this.store.announce('All settings reset to their defaults.');
        break;
      case 'help':
        if (this.helpOpen()) {
          this.closeHelp();
        } else {
          this.openHelp();
        }
        break;
    }
  }
}
