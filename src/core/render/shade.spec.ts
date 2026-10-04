import { buildTemperatureLut } from '../color/temperature-lut';
import { luminanceOfLinearSrgb } from '../color/xyz-srgb';
import { normalize, vec3 } from '../physics/vec3';
import { BLACK, diskRadiance, skyRadiance } from './shade';
import { defaultView } from './view';

const lut = buildTemperatureLut();
const plain = { ...defaultView, gravitationalRedshift: false, doppler: false };

describe('diskRadiance', () => {
  it('is black at the inner edge where the temperature vanishes', () => {
    expect(luminanceOfLinearSrgb(diskRadiance(6, 0, defaultView, lut))).toBe(0);
  });

  it('gives unit luminance at the reference temperature when no shift applies', () => {
    const view = { ...plain, peakTemperature: 6500 };
    const peakRadius = (49 / 36) * 6;
    expect(luminanceOfLinearSrgb(diskRadiance(peakRadius, 0, view, lut))).toBeCloseTo(1, 2);
  });

  it('scales with the fourth power of the peak temperature', () => {
    const peakRadius = (49 / 36) * 6;
    const base = luminanceOfLinearSrgb(
      diskRadiance(peakRadius, 0, { ...plain, peakTemperature: 6500 }, lut),
    );
    const doubled = luminanceOfLinearSrgb(
      diskRadiance(peakRadius, 0, { ...plain, peakTemperature: 13000 }, lut),
    );
    expect(doubled / base).toBeCloseTo(16, 0);
  });

  it('is brighter and bluer on the approaching side', () => {
    const approaching = diskRadiance(9, 3, defaultView, lut);
    const receding = diskRadiance(9, -3, defaultView, lut);
    expect(luminanceOfLinearSrgb(approaching)).toBeGreaterThan(2 * luminanceOfLinearSrgb(receding));
    expect(approaching[2] / approaching[0]).toBeGreaterThan(receding[2] / receding[0]);
  });

  it('drops the shift terms when the switches are off', () => {
    const shifted = diskRadiance(9, 3, defaultView, lut);
    const unshifted = diskRadiance(9, 3, plain, lut);
    expect(unshifted).not.toEqual(shifted);
    expect(diskRadiance(9, -3, plain, lut)).toEqual(unshifted);
  });
});

describe('skyRadiance', () => {
  it('adds the nebula and the stars', () => {
    const direction = normalize(vec3(0.3, 0.2, 0.9));
    const sky = skyRadiance(direction, lut);
    for (const channel of sky) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(channel)).toBe(true);
    }
  });

  it('exposes black for captured rays', () => {
    expect(BLACK).toEqual([0, 0, 0]);
  });
});
