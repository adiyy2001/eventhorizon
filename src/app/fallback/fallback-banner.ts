import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { poolSize } from '../../core/render/tile-scheduler';
import { viewportSize } from '../viewport/render-session';

@Component({
  selector: 'app-fallback-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fallback-banner.html',
  styleUrl: './fallback-banner.css',
})
export class FallbackBanner {
  readonly reason = input.required<string>();
  readonly detail = input('');

  protected readonly workers = poolSize(navigator.hardwareConcurrency);
  protected readonly edge = viewportSize;
}
