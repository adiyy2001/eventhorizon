import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-range-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './range-field.html',
  styleUrl: './range-field.css',
})
export class RangeField {
  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly step = input.required<number>();
  readonly value = input.required<number>();
  readonly unit = input<string>('');
  readonly decimals = input<number>(0);

  readonly valueChange = output<number>();
  readonly committed = output<string>();

  protected readonly valueText = computed(() => this.describe(this.value()));

  protected onInput(event: Event): void {
    this.valueChange.emit(this.readNumber(event));
  }

  protected onChange(event: Event): void {
    const value = this.readNumber(event);
    this.valueChange.emit(value);
    this.committed.emit(`${this.label()} ${this.describe(value)}`);
  }

  private describe(value: number): string {
    const text = value.toFixed(this.decimals());
    return this.unit() === '' ? text : `${text} ${this.unit()}`;
  }

  private readNumber(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }
}
