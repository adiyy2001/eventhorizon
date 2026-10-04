import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GpuStatus, unsupportedMessages } from './gpu-status';
import { Viewport } from './viewport/viewport';

@Component({
  selector: 'app-root',
  imports: [Viewport],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly gpuStatus = inject(GpuStatus);
  protected readonly state = this.gpuStatus.state;
  protected readonly unsupportedMessage = computed(() => {
    const state = this.state();
    return state.status === 'unsupported'
      ? (unsupportedMessages[state.reason] ?? state.detail)
      : '';
  });
}
