import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-toggle-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toggle-field.html',
  styleUrl: './toggle-field.css',
})
export class ToggleField {
  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  readonly hint = input<string>('');
  readonly checked = input.required<boolean>();

  readonly checkedChange = output<boolean>();
  readonly committed = output<string>();

  protected onChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.checkedChange.emit(checked);
    this.committed.emit(`${this.label()} ${checked ? 'on' : 'off'}`);
  }
}
