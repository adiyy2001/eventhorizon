import { defaultSettings, mergeSettings } from '../../core/render/settings';
import { cameraAnnouncement, canvasDescription, effectsDescription } from './descriptions';

describe('descriptions', () => {
  it('announces the camera in whole degrees', () => {
    expect(cameraAnnouncement(defaultSettings)).toBe(
      'Inclination 75 degrees, azimuth 0 degrees, distance 50 M.',
    );
  });

  it('lists every effect with its state', () => {
    const text = effectsDescription(mergeSettings(defaultSettings, { view: { doppler: false } }));
    expect(text).toContain('Doppler beaming off');
    expect(text).toContain('Lensing on');
  });

  it('describes the canvas and tracks the settings', () => {
    const plain = canvasDescription(defaultSettings);
    expect(plain).toContain('No overlays.');
    expect(plain).not.toContain('Split view');
    const busy = canvasDescription(
      mergeSettings(defaultSettings, {
        view: { peakTemperature: 8000 },
        overlays: { photonSphere: true, isco: true, shadowEdge: true },
        split: { enabled: true, position: 0.4 },
      }),
    );
    expect(busy).toContain('peak temperature 8000 K');
    expect(busy).toContain('photon sphere, innermost stable orbit, shadow edge');
    expect(busy).toContain('Split view at 40 percent');
  });
});
