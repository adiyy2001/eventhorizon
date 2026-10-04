import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type OverlaySettings, type SplitSettings } from '../../core/render/settings';

export type LineStyle = 'dotted' | 'dashed' | 'solid';

export interface LegendEntry {
  id: 'photon-sphere' | 'isco' | 'shadow-edge';
  label: string;
  style: LineStyle;
}

const entries: readonly (LegendEntry & { key: keyof OverlaySettings })[] = [
  { id: 'photon-sphere', key: 'photonSphere', label: 'Photon sphere, r = 3 M', style: 'dotted' },
  { id: 'isco', key: 'isco', label: 'Innermost stable orbit, r = 6 M', style: 'dashed' },
  { id: 'shadow-edge', key: 'shadowEdge', label: 'Shadow edge, b = 3√3 M', style: 'solid' },
];

export function legendEntries(overlays: OverlaySettings): LegendEntry[] {
  return entries
    .filter((entry) => overlays[entry.key])
    .map(({ id, label, style }) => ({ id, label, style }));
}

@Component({
  selector: 'app-overlay-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overlay-legend.html',
  styleUrl: './overlay-legend.css',
})
export class OverlayLegend {
  readonly overlays = input.required<OverlaySettings>();
  readonly split = input.required<SplitSettings>();
  protected readonly items = computed(() => legendEntries(this.overlays()));
}
