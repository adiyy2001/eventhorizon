import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { GpuStatus } from '../gpu-status';
import { SettingsStore, type SettingsChange } from '../state/settings.store';
import {
  controlGroups,
  splitSlider,
  splitSwitch,
  type SliderSpec,
  type SwitchSpec,
} from './control-specs';
import { RangeField } from './range-field';
import { ToggleField } from './toggle-field';

export const softwareOverlayReason = 'Needs WebGPU. The software renderer does not draw it.';

@Component({
  selector: 'app-control-panel',
  imports: [RangeField, ToggleField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './control-panel.html',
  styleUrl: './control-panel.css',
})
export class ControlPanel {
  protected readonly store = inject(SettingsStore);
  private readonly gpuStatus = inject(GpuStatus);
  protected readonly software = computed(() => this.gpuStatus.backend() === 'cpu');
  protected readonly softwareOverlayReason = softwareOverlayReason;
  protected readonly groups = controlGroups;
  protected readonly splitSlider = splitSlider;
  protected readonly splitSwitch = splitSwitch;

  readonly helpRequested = output();

  protected sliderValue(spec: SliderSpec): number {
    return spec.read(this.store.settings());
  }

  protected switchValue(spec: SwitchSpec): boolean {
    return spec.read(this.store.settings()) && !this.unavailable(spec);
  }

  protected unavailable(spec: SwitchSpec): boolean {
    return spec.needsGpu === true && this.software();
  }

  protected apply(change: SettingsChange): void {
    this.store.update(change);
  }

  protected announce(message: string): void {
    this.store.announce(message);
  }

  protected reset(): void {
    this.store.reset();
    this.store.announce('All settings reset to their defaults.');
  }
}
