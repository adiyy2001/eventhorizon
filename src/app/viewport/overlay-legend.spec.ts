import { TestBed } from '@angular/core/testing';
import { defaultSettings } from '../../core/render/settings';
import { legendEntries, OverlayLegend } from './overlay-legend';

function render(overlays = defaultSettings.overlays, split = defaultSettings.split): HTMLElement {
  const fixture = TestBed.createComponent(OverlayLegend);
  fixture.componentRef.setInput('overlays', overlays);
  fixture.componentRef.setInput('split', split);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('legendEntries', () => {
  it('lists the enabled overlays with distinct line styles', () => {
    const entries = legendEntries({ photonSphere: true, isco: true, shadowEdge: true });
    expect(entries.map((entry) => entry.style)).toEqual(['dotted', 'dashed', 'solid']);
    expect(new Set(entries.map((entry) => entry.label)).size).toBe(3);
  });

  it('is empty when nothing is enabled', () => {
    expect(legendEntries(defaultSettings.overlays)).toEqual([]);
  });
});

describe('OverlayLegend', () => {
  it('renders nothing when no overlay and no split are active', () => {
    expect(render().querySelector('[data-testid="overlay-legend"]')).toBeNull();
  });

  it('names each active overlay and its line style in text', () => {
    const root = render({ photonSphere: true, isco: false, shadowEdge: true });
    const items = Array.from(root.querySelectorAll('li')).map((item) => item.textContent.trim());
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Photon sphere');
    expect(items[0]).toContain('dotted');
    expect(items[1]).toContain('Shadow edge');
    expect(items[1]).toContain('solid');
  });

  it('explains the split when it is enabled', () => {
    const root = render(defaultSettings.overlays, { enabled: true, position: 0.5 });
    expect(root.textContent).toContain('full model');
    expect(root.querySelector('[data-overlay="split"]')).not.toBeNull();
  });
});
