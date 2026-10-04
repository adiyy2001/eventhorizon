import { TestBed } from '@angular/core/testing';
import { settingRanges } from '../../core/render/settings';
import { SettingsStore } from './settings.store';
import { SettingsUrl, urlWriteDelayMilliseconds } from './settings-url';

function setLocation(search: string): void {
  window.history.replaceState(null, '', `/${search}`);
}

function start() {
  const store = TestBed.inject(SettingsStore);
  const url = TestBed.inject(SettingsUrl);
  return { store, url };
}

describe('SettingsUrl', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    setLocation('');
  });

  it('restores the settings from the address', () => {
    setLocation('?v=1&dist=25&ov=p');
    const { store } = start();
    expect(store.view().distance).toBe(25);
    expect(store.overlays().photonSphere).toBe(true);
  });

  it('starts from the defaults for garbage', () => {
    setLocation('?v=1&dist=%%%&off=!!');
    const { store } = start();
    expect(store.isDefault()).toBe(true);
  });

  it('writes a changed state to the address after a short delay', () => {
    setLocation('');
    const { store } = start();
    TestBed.tick();
    store.update({ exposure: 1.5 });
    TestBed.tick();
    expect(window.location.search).toBe('');
    vi.advanceTimersByTime(urlWriteDelayMilliseconds + 1);
    expect(window.location.search).toBe('?v=1&ev=1.5');
  });

  it('keeps foreign parameters and does not grow the history', () => {
    setLocation('?automation');
    const before = window.history.length;
    const { store } = start();
    store.update({ view: { distance: 20 } });
    TestBed.tick();
    vi.advanceTimersByTime(urlWriteDelayMilliseconds + 1);
    expect(window.location.search).toBe('?automation&v=1&dist=20');
    expect(window.history.length).toBe(before);
  });

  it('removes its parameters after a reset', () => {
    setLocation('?v=1&dist=20');
    const { store } = start();
    store.reset();
    TestBed.tick();
    vi.advanceTimersByTime(urlWriteDelayMilliseconds + 1);
    expect(window.location.search).toBe('');
  });

  it('collapses a burst of changes into one write of the last state', () => {
    const { store } = start();
    const replace = vi.spyOn(window.history, 'replaceState');
    for (const exposure of [1, 2, 3]) {
      store.update({ exposure });
      TestBed.tick();
      vi.advanceTimersByTime(20);
    }
    vi.advanceTimersByTime(urlWriteDelayMilliseconds + 1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?v=1&ev=3');
    replace.mockRestore();
  });

  it('clamps out of range values from the address', () => {
    setLocation('?v=1&dist=99999');
    const { store } = start();
    expect(store.view().distance).toBe(settingRanges.distance.max);
  });
});
