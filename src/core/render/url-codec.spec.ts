import { defaultSettings, mergeSettings, settingRanges, settingsEqual } from './settings';
import { decodeSettings, encodeSettings, settingsQuery, urlStateVersion } from './url-codec';

const degrees = (value: number): number => (value * Math.PI) / 180;

const customised = mergeSettings(defaultSettings, {
  view: {
    inclination: degrees(62.5),
    distance: 31.25,
    azimuth: degrees(-40),
    verticalFieldOfView: degrees(28),
    diskOuterRadius: 22,
    peakTemperature: 8200,
    doppler: false,
    higherOrderImages: false,
  },
  exposure: 1.25,
  bloomStrength: 0.12,
  overlays: { photonSphere: true, shadowEdge: true },
  split: { enabled: true, position: 0.375 },
});

describe('encodeSettings', () => {
  it('writes nothing for the defaults', () => {
    expect(encodeSettings(defaultSettings)).toBe('');
  });

  it('writes only what differs from the defaults, led by the version', () => {
    const changed = mergeSettings(defaultSettings, { view: { distance: 20 } });
    expect(encodeSettings(changed)).toBe(`v=${String(urlStateVersion)}&dist=20`);
  });

  it('lists disabled switches, enabled overlays and the split position', () => {
    const encoded = encodeSettings(
      mergeSettings(defaultSettings, {
        view: { lensing: false, gravitationalRedshift: false },
        overlays: { isco: true },
        split: { enabled: true, position: 0.25 },
      }),
    );
    expect(encoded).toBe('v=1&off=lg&ov=i&sp=0.25');
  });

  it('stays compact for a fully customised state', () => {
    expect(encodeSettings(customised).length).toBeLessThan(120);
  });
});

describe('decodeSettings', () => {
  it('returns the defaults for an empty query', () => {
    expect(decodeSettings('')).toEqual(defaultSettings);
    expect(decodeSettings('?')).toEqual(defaultSettings);
  });

  it('round trips a customised state', () => {
    const decoded = decodeSettings(encodeSettings(customised));
    expect(settingsEqual(decoded, customised)).toBe(true);
  });

  it('is stable: encoding a decoded state gives the same text', () => {
    const once = encodeSettings(customised);
    expect(encodeSettings(decodeSettings(once))).toBe(once);
  });

  it('round trips every value reachable by the controls without drift after one pass', () => {
    const noisy = mergeSettings(defaultSettings, {
      view: { inclination: 1.23456789, distance: 33.333333, peakTemperature: 7777.7 },
      exposure: 0.123456,
    });
    const canonical = decodeSettings(encodeSettings(noisy));
    expect(settingsEqual(decodeSettings(encodeSettings(canonical)), canonical)).toBe(true);
  });

  it('falls back to the defaults for an unknown version', () => {
    expect(decodeSettings('v=2&dist=20')).toEqual(defaultSettings);
    expect(decodeSettings('dist=20')).toEqual(defaultSettings);
    expect(decodeSettings('v=abc&dist=20')).toEqual(defaultSettings);
  });

  it('ignores malformed numbers and keeps the other fields', () => {
    const decoded = decodeSettings('v=1&dist=abc&inc=1e3&ro=24&t=--5&ev=NaN');
    expect(decoded.view.distance).toBe(defaultSettings.view.distance);
    expect(decoded.view.inclination).toBe(defaultSettings.view.inclination);
    expect(decoded.view.diskOuterRadius).toBe(24);
    expect(decoded.view.peakTemperature).toBe(defaultSettings.view.peakTemperature);
    expect(decoded.exposure).toBe(0);
  });

  it('clamps values outside the ranges', () => {
    const decoded = decodeSettings('v=1&dist=100000&inc=400&ro=-5&t=10&ev=99&bl=9&sp=7');
    expect(decoded.view.distance).toBe(settingRanges.distance.max);
    expect(decoded.view.inclination).toBe(settingRanges.inclination.max);
    expect(decoded.view.diskOuterRadius).toBe(settingRanges.diskOuterRadius.min);
    expect(decoded.view.peakTemperature).toBe(settingRanges.peakTemperature.min);
    expect(decoded.exposure).toBe(settingRanges.exposure.max);
    expect(decoded.bloomStrength).toBe(settingRanges.bloomStrength.max);
    expect(decoded.split).toEqual({ enabled: true, position: settingRanges.splitPosition.max });
  });

  it('survives garbage without throwing', () => {
    const garbage = [
      '%',
      '%E0%A4%A',
      '&&&',
      '===',
      'v=1&off=zzz&ov=!!',
      'v=1&sp=',
      '__proto__=1&constructor=2',
      'v=1&dist=1&dist=2',
      '?v=1&inc=%00',
    ];
    for (const query of garbage) {
      expect(() => decodeSettings(query)).not.toThrow();
      expect(Number.isFinite(decodeSettings(query).view.distance)).toBe(true);
    }
  });

  it('uses the first of a repeated key', () => {
    expect(decodeSettings('v=1&dist=20&dist=60').view.distance).toBe(20);
  });

  it('treats an empty split value as enabled at the default position', () => {
    expect(decodeSettings('v=1&sp=').split).toEqual({ enabled: true, position: 0.5 });
  });

  it('unknown switch letters do not enable or disable anything else', () => {
    const decoded = decodeSettings('v=1&off=z');
    expect(decoded.view.lensing).toBe(true);
    expect(decoded.view.doppler).toBe(true);
  });
});

describe('settingsQuery', () => {
  it('keeps foreign parameters such as the automation flag', () => {
    const query = settingsQuery(
      '?automation&utm=1',
      mergeSettings(defaultSettings, { exposure: 1 }),
    );
    expect(query).toBe('?automation&utm=1&v=1&ev=1');
  });

  it('replaces its own parameters', () => {
    const query = settingsQuery('?v=1&dist=20&automation', defaultSettings);
    expect(query).toBe('?automation');
  });

  it('returns an empty string when nothing is left', () => {
    expect(settingsQuery('?v=1&dist=20', defaultSettings)).toBe('');
    expect(settingsQuery('', defaultSettings)).toBe('');
  });
});
