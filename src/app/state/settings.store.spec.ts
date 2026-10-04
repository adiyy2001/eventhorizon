import { TestBed } from '@angular/core/testing';
import { defaultSettings, settingRanges } from '../../core/render/settings';
import { SettingsStore, wrapAzimuth } from './settings.store';

function create() {
  TestBed.configureTestingModule({});
  return TestBed.inject(SettingsStore);
}

describe('SettingsStore', () => {
  it('starts at the defaults', () => {
    const store = create();
    expect(store.settings()).toEqual(defaultSettings);
    expect(store.isDefault()).toBe(true);
  });

  it('merges a change and sanitizes it', () => {
    const store = create();
    store.update({ view: { distance: 1000 }, exposure: 1, overlays: { isco: true } });
    expect(store.view().distance).toBe(settingRanges.distance.max);
    expect(store.settings().exposure).toBe(1);
    expect(store.overlays().isco).toBe(true);
    expect(store.overlays().photonSphere).toBe(false);
    expect(store.isDefault()).toBe(false);
  });

  it('orbits and clamps the inclination at the poles', () => {
    const store = create();
    store.orbit(0.1, -10);
    expect(store.view().azimuth).toBeCloseTo(0.1, 12);
    expect(store.view().inclination).toBe(settingRanges.inclination.min);
    store.orbit(0, 10);
    expect(store.view().inclination).toBe(settingRanges.inclination.max);
  });

  it('wraps the azimuth into one turn', () => {
    expect(wrapAzimuth(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5, 12);
    expect(wrapAzimuth(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5, 12);
    expect(wrapAzimuth(0.3)).toBe(0.3);
    const store = create();
    store.orbit(3.5, 0);
    store.orbit(3.5, 0);
    expect(Math.abs(store.view().azimuth)).toBeLessThanOrEqual(Math.PI);
  });

  it('zooms multiplicatively inside the distance range', () => {
    const store = create();
    store.zoom(0.5);
    expect(store.view().distance).toBe(25);
    store.zoom(0.0001);
    expect(store.view().distance).toBe(settingRanges.distance.min);
  });

  it('replaces the whole state from untrusted input', () => {
    const store = create();
    store.replace({ exposure: 99, view: { distance: 'far' } });
    expect(store.settings().exposure).toBe(settingRanges.exposure.max);
    expect(store.view().distance).toBe(defaultSettings.view.distance);
  });

  it('resets to the defaults', () => {
    const store = create();
    store.update({ exposure: 2 });
    store.reset();
    expect(store.settings()).toEqual(defaultSettings);
  });

  it('keeps an announcement and can describe the camera', () => {
    const store = create();
    store.announce('Reset.');
    expect(store.announcement()).toBe('Reset.');
    store.announceCamera();
    expect(store.announcement()).toContain('Inclination 75 degrees');
  });
});
