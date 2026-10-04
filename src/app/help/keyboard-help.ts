import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { keyboardHelp } from '../state/keyboard-map';

@Component({
  selector: 'app-keyboard-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './keyboard-help.html',
  styleUrl: './keyboard-help.css',
})
export class KeyboardHelp {
  readonly open = input.required<boolean>();
  readonly closed = output();
  protected readonly entries = keyboardHelp;
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('close');

  constructor() {
    effect(() => {
      if (this.open()) {
        this.closeButton()?.nativeElement.focus();
      }
    });
  }
}
