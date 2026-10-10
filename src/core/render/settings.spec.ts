import { defaultView } from './view';
import {
  cameraHash,
  clampToRange,
  cpuSupportedSettings,
  defaultSettings,
  gpuOnlyOverlays,
  fullModelView,
  mergeSettings,
  sanitizeSettings,
  sceneHash,
  settingRanges,
  settingsEqual,
  settingsHash,
  settingsPost,
} from './settings';

describe('settings sanitizing', () => {
  it('returns the defaults for garbage input', () => {
    for (const input of [undefined, null, 7, 'text', [], { view: 3, overlays: 'x', split: null }]) {
      expect(sanitizeSettings(input)).toEqual(defaultSettings);
    }
  });

  it('keeps valid values', () => {
    const input = {
      view: { distance: 40, inclination: 1.2, doppler: false, peakTemperature: 7000 },
      exposure: 1.5,
      bloomStrength: 0.1,
      overlays: { isco: true },
      split: { enabled: true, position: 0.3 },
    };
    const settings = sanitizeSettings(input);
    expect(settings.view.distance).toBe(40);
    expect(settings.view.inclination).toBe(1.2);
    expect(settings.view.doppler).toBe(false);
    expect(settings.view.lensing).toBe(true);
    expect(settings.view.peakTemperature).toBe(7000);
    expect(settings.exposure).toBe(1.5);
    expect(settings.overlays).toEqual({ photonSphere: false, isco: true, shadowEdge: false });
    expect(settings.split).toEqual({ enabled: true, position: 0.3 });
  });

  it('clamps numbers to their ranges', () => {
    const settings = sanitizeSettings({
      view: { distance: 1, inclination: 99, diskOuterRadius: 1000, peakTemperature: 1 },
      exposure: -50,
      bloomStrength: 9,
      split: { enabled: true, position: 7 },
    });
    expect(settings.view.distance).toBe(settingRanges.distance.min);
    expect(settings.view.inclination).toBe(settingRanges.inclination.max);
    expect(settings.view.diskOuterRadius).toBe(settingRanges.diskOuterRadius.max);
    expect(settings.view.peakTemperature).toBe(settingRanges.peakTemperature.min);
    expect(settings.exposure).toBe(settingRanges.exposure.min);
    expect(settings.bloomStrength).toBe(settingRanges.bloomStrength.max);
    expect(settings.split.position).toBe(settingRanges.splitPosition.max);
  });

  it('replaces NaN and infinity with the default', () => {
    expect(clampToRange(Number.NaN, settingRanges.distance, 50)).toBe(50);
    expect(clampToRange(Number.POSITIVE_INFINITY, settingRanges.distance, 50)).toBe(50);
    const settings = sanitizeSettings({ view: { distance: Number.NaN }, exposure: Infinity });
    expect(settings.view.distance).toBe(defaultView.distance);
    expect(settings.exposure).toBe(defaultSettings.exposure);
  });

  it('ignores values of the wrong type', () => {
    const settings = sanitizeSettings({
      view: { distance: '30', lensing: 'yes' },
      overlays: { isco: 1 },
    });
    expect(settings).toEqual(defaultSettings);
  });

  it('keeps every default inside its range', () => {
    expect(sanitizeSettings(defaultSettings)).toEqual(defaultSettings);
  });

  it('keeps the disk outer edge outside the ISCO for every allowed value', () => {
    expect(settingRanges.diskOuterRadius.min).toBeGreaterThan(6);
  });
});

describe('merging', () => {
  it('applies a partial change and clamps the result', () => {
    const merged = mergeSettings(defaultSettings, {
      view: { distance: 1000 },
      overlays: { photonSphere: true },
      split: { enabled: true },
      exposure: 1,
    });
    expect(merged.view.distance).toBe(settingRanges.distance.max);
    expect(merged.overlays.photonSphere).toBe(true);
    expect(merged.overlays.isco).toBe(false);
    expect(merged.split.enabled).toBe(true);
    expect(merged.split.position).toBe(0.5);
    expect(merged.exposure).toBe(1);
  });

  it('leaves the base untouched', () => {
    mergeSettings(defaultSettings, { view: { doppler: false } });
    expect(defaultSettings.view.doppler).toBe(true);
  });
});

describe('equality', () => {
  it('is true for copies and false after any single change', () => {
    expect(settingsEqual(defaultSettings, sanitizeSettings(defaultSettings))).toBe(true);
    const changes = [
      { view: { distance: 51 } },
      { view: { inclination: 1 } },
      { view: { azimuth: 0.1 } },
      { view: { verticalFieldOfView: 0.8 } },
      { view: { diskOuterRadius: 12 } },
      { view: { peakTemperature: 6000 } },
      { view: { lensing: false } },
      { view: { higherOrderImages: false } },
      { view: { gravitationalRedshift: false } },
      { view: { doppler: false } },
      { exposure: 1 },
      { bloomStrength: 0.2 },
      { overlays: { photonSphere: true } },
      { overlays: { isco: true } },
      { overlays: { shadowEdge: true } },
      { split: { enabled: true } },
      { split: { position: 0.4 } },
    ];
    for (const change of changes) {
      expect(settingsEqual(defaultSettings, mergeSettings(defaultSettings, change))).toBe(false);
    }
  });
});

describe('hashes', () => {
  it('has a fixed value for the defaults', () => {
    expect(settingsHash(defaultSettings)).toBe(settingsHash(sanitizeSettings({})));
    expect(sceneHash(defaultSettings)).toMatchInlineSnapshot(`1352948614`);
    expect(cameraHash(defaultSettings)).toMatchInlineSnapshot(`1137169010`);
    expect(settingsHash(defaultSettings)).toMatchInlineSnapshot(`1379288160`);
  });

  it('is deterministic and an unsigned 32 bit integer', () => {
    const hash = settingsHash(defaultSettings);
    expect(hash).toBe(settingsHash({ ...defaultSettings }));
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(2 ** 32);
  });

  it('changes with every field that changes the image', () => {
    const base = sceneHash(defaultSettings);
    const changed = [
      { view: { distance: 51 } },
      { view: { inclination: 1 } },
      { view: { azimuth: 0.1 } },
      { view: { verticalFieldOfView: 0.8 } },
      { view: { diskOuterRadius: 12 } },
      { view: { peakTemperature: 6000 } },
      { view: { lensing: false } },
      { view: { higherOrderImages: false } },
      { view: { gravitationalRedshift: false } },
      { view: { doppler: false } },
      { overlays: { photonSphere: true } },
      { overlays: { isco: true } },
      { split: { enabled: true } },
    ].map((change) => sceneHash(mergeSettings(defaultSettings, change)));
    expect(new Set([base, ...changed]).size).toBe(changed.length + 1);
  });

  it('ignores post settings and the shadow overlay for the scene hash', () => {
    const post = mergeSettings(defaultSettings, {
      exposure: 2,
      bloomStrength: 0.3,
      overlays: { shadowEdge: true },
    });
    expect(sceneHash(post)).toBe(sceneHash(defaultSettings));
    expect(settingsHash(post)).not.toBe(settingsHash(defaultSettings));
  });

  it('ignores the split position while the split is off', () => {
    const moved = mergeSettings(defaultSettings, { split: { position: 0.8 } });
    expect(sceneHash(moved)).toBe(sceneHash(defaultSettings));
    const on = mergeSettings(defaultSettings, { split: { enabled: true, position: 0.5 } });
    const onMoved = mergeSettings(defaultSettings, { split: { enabled: true, position: 0.6 } });
    expect(sceneHash(on)).not.toBe(sceneHash(onMoved));
  });

  it('camera hash follows only the camera', () => {
    const camera = cameraHash(defaultSettings);
    expect(cameraHash(mergeSettings(defaultSettings, { view: { doppler: false } }))).toBe(camera);
    expect(cameraHash(mergeSettings(defaultSettings, { view: { distance: 40 } }))).not.toBe(camera);
    expect(cameraHash(mergeSettings(defaultSettings, { view: { azimuth: 0.2 } }))).not.toBe(camera);
  });

  it('tolerates differences far below the quantization step', () => {
    const nudged = mergeSettings(defaultSettings, { view: { distance: 50 + 1e-9 } });
    expect(sceneHash(nudged)).toBe(sceneHash(defaultSettings));
  });
});

describe('derived values', () => {
  it('reports the post settings', () => {
    const post = settingsPost(mergeSettings(defaultSettings, { exposure: 1, bloomStrength: 0.2 }));
    expect(post.exposure).toBe(1);
    expect(post.bloomStrength).toBe(0.2);
    expect(post.ditherAmplitude).toBe(1);
  });

  it('builds the full model view with every effect on and the rest unchanged', () => {
    const view = { ...defaultView, lensing: false, doppler: false, distance: 33 };
    const full = fullModelView(view);
    expect(
      full.lensing && full.doppler && full.higherOrderImages && full.gravitationalRedshift,
    ).toBe(true);
    expect(full.distance).toBe(33);
  });
});

describe('cpuSupportedSettings', () => {
  it('names the overlays that only the graphics path can draw', () => {
    expect(gpuOnlyOverlays).toEqual(['photonSphere', 'isco']);
  });

  it('returns the same object when no graphics only overlay is on', () => {
    const settings = mergeSettings(defaultSettings, {
      overlays: { shadowEdge: true },
      split: { enabled: true },
    });
    expect(cpuSupportedSettings(settings)).toBe(settings);
  });

  it('switches the graphics only overlays off and keeps everything else', () => {
    const settings = mergeSettings(defaultSettings, {
      view: { distance: 33 },
      exposure: 1,
      overlays: { photonSphere: true, isco: true, shadowEdge: true },
      split: { enabled: true, position: 0.4 },
    });
    const supported = cpuSupportedSettings(settings);
    expect(supported.overlays).toEqual({ photonSphere: false, isco: false, shadowEdge: true });
    expect(supported.view).toBe(settings.view);
    expect(supported.exposure).toBe(1);
    expect(supported.split).toEqual({ enabled: true, position: 0.4 });
  });

  it('does not change the settings it was given', () => {
    const settings = mergeSettings(defaultSettings, { overlays: { isco: true } });
    cpuSupportedSettings(settings);
    expect(settings.overlays.isco).toBe(true);
  });
});
