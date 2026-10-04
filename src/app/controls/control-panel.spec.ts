import { TestBed } from '@angular/core/testing';
import { defaultSettings, settingRanges } from '../../core/render/settings';
import { SettingsStore } from '../state/settings.store';
import { ControlPanel } from './control-panel';

function create() {
  TestBed.configureTestingModule({ imports: [ControlPanel] });
  const fixture = TestBed.createComponent(ControlPanel);
  const store = TestBed.inject(SettingsStore);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, store, root };
}

function slider(root: HTMLElement, id: string): HTMLInputElement {
  const element = root.querySelector<HTMLInputElement>(`input[type="range"]#${id}`);
  if (element === null) {
    throw new Error(`no slider ${id}`);
  }
  return element;
}

function toggle(root: HTMLElement, id: string): HTMLInputElement {
  const element = root.querySelector<HTMLInputElement>(`input[type="checkbox"]#${id}`);
  if (element === null) {
    throw new Error(`no toggle ${id}`);
  }
  return element;
}

function drag(element: HTMLInputElement, value: number, commit = true): void {
  element.value = String(value);
  element.dispatchEvent(new Event('input'));
  if (commit) {
    element.dispatchEvent(new Event('change'));
  }
}

describe('ControlPanel', () => {
  it('shows every slider with a label, a value and a spoken value', () => {
    const { root } = create();
    const ids = [
      'inclination',
      'distance',
      'outer-radius',
      'peak-temperature',
      'exposure',
      'bloom',
    ];
    for (const id of ids) {
      const input = slider(root, id);
      expect(root.querySelector(`label[for="${id}"]`)?.textContent.trim().length).toBeGreaterThan(
        0,
      );
      expect(input.getAttribute('aria-valuetext')).toBeTruthy();
    }
    expect(slider(root, 'inclination').getAttribute('aria-valuetext')).toBe('75 degrees');
    expect(slider(root, 'distance').getAttribute('aria-valuetext')).toBe('50 M');
    expect(slider(root, 'peak-temperature').getAttribute('aria-valuetext')).toBe('5500 K');
    expect(slider(root, 'exposure').getAttribute('aria-valuetext')).toBe('0.0 EV');
  });

  it('writes an inclination in degrees as radians', () => {
    const { fixture, store, root } = create();
    drag(slider(root, 'inclination'), 60);
    fixture.detectChanges();
    expect(store.view().inclination).toBeCloseTo((60 * Math.PI) / 180, 12);
    expect(slider(root, 'inclination').getAttribute('aria-valuetext')).toBe('60 degrees');
  });

  it('binds each slider to its setting', () => {
    const { store, root } = create();
    drag(slider(root, 'distance'), 80);
    drag(slider(root, 'outer-radius'), 24);
    drag(slider(root, 'peak-temperature'), 9000);
    drag(slider(root, 'exposure'), 1.5);
    drag(slider(root, 'bloom'), 0.2);
    expect(store.view().distance).toBe(80);
    expect(store.view().diskOuterRadius).toBe(24);
    expect(store.view().peakTemperature).toBe(9000);
    expect(store.settings().exposure).toBe(1.5);
    expect(store.settings().bloomStrength).toBe(0.2);
  });

  it('uses the ranges of the settings schema', () => {
    const { root } = create();
    expect(Number(slider(root, 'distance').min)).toBe(settingRanges.distance.min);
    expect(Number(slider(root, 'distance').max)).toBe(settingRanges.distance.max);
    expect(Number(slider(root, 'exposure').min)).toBe(settingRanges.exposure.min);
  });

  it('flips each physics switch and overlay', () => {
    const { fixture, store, root } = create();
    const cases: [string, () => boolean][] = [
      ['lensing', () => store.view().lensing],
      ['doppler', () => store.view().doppler],
      ['redshift', () => store.view().gravitationalRedshift],
      ['higher-order', () => store.view().higherOrderImages],
    ];
    for (const [id, read] of cases) {
      expect(toggle(root, id).checked).toBe(true);
      toggle(root, id).click();
      fixture.detectChanges();
      expect(read()).toBe(false);
      expect(toggle(root, id).checked).toBe(false);
    }
    const overlays: [string, () => boolean][] = [
      ['overlay-photon', () => store.overlays().photonSphere],
      ['overlay-isco', () => store.overlays().isco],
      ['overlay-shadow', () => store.overlays().shadowEdge],
    ];
    for (const [id, read] of overlays) {
      toggle(root, id).click();
      expect(read()).toBe(true);
    }
  });

  it('gives every switch a description', () => {
    const { root } = create();
    for (const input of root.querySelectorAll('input[type="checkbox"]')) {
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(
        root.querySelector(`#${describedBy ?? ''}`)?.textContent.trim().length,
      ).toBeGreaterThan(0);
    }
  });

  it('shows the divider slider only while the compare view is on', () => {
    const { fixture, store, root } = create();
    expect(root.querySelector('#split-position')).toBeNull();
    toggle(root, 'split-enabled').click();
    fixture.detectChanges();
    expect(store.split().enabled).toBe(true);
    drag(slider(root, 'split-position'), 30);
    expect(store.split().position).toBeCloseTo(0.3, 12);
  });

  it('announces a committed change but not every drag step', () => {
    const { store, root } = create();
    drag(slider(root, 'distance'), 70, false);
    expect(store.announcement()).toBe('');
    slider(root, 'distance').dispatchEvent(new Event('change'));
    expect(store.announcement()).toBe('Distance 70 M');
    toggle(root, 'doppler').click();
    expect(store.announcement()).toBe('Doppler beaming off');
  });

  it('resets everything and is disabled at the defaults', () => {
    const { fixture, store, root } = create();
    const reset = root.querySelector<HTMLButtonElement>('[data-testid="reset"]');
    expect(reset?.disabled).toBe(true);
    drag(slider(root, 'exposure'), 2);
    fixture.detectChanges();
    expect(reset?.disabled).toBe(false);
    reset?.click();
    expect(store.settings()).toEqual(defaultSettings);
    expect(store.announcement()).toContain('reset');
  });

  it('asks for the keyboard help', () => {
    const { fixture, root } = create();
    const requested = vi.fn();
    fixture.componentInstance.helpRequested.subscribe(requested);
    root.querySelector<HTMLButtonElement>('[data-testid="open-help"]')?.click();
    expect(requested).toHaveBeenCalledOnce();
  });
});
