import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
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

@Component({
  selector: 'app-control-panel',
  imports: [RangeField, ToggleField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './control-panel.html',
  styleUrl: './control-panel.css',
})
export class ControlPanel {
  protected readonly store = inject(SettingsStore);
  protected readonly groups = controlGroups;
  protected readonly splitSlider = splitSlider;
  protected readonly splitSwitch = splitSwitch;

  readonly helpRequested = output();

  protected sliderValue(spec: SliderSpec): number {
    return spec.read(this.store.settings());
  }

  protected switchValue(spec: SwitchSpec): boolean {
    return spec.read(this.store.settings());
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
