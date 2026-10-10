import { computeGlow } from './bloom';
import { renderCpuScene } from './cpu-frame';
import { renderCpuImage } from './cpu-image';
import { encodeFrame } from './cpu-post';
import { defaultSettings, mergeSettings } from './settings';

const size = { width: 24, height: 24 };

describe('renderCpuImage', () => {
  it('is the traced scene run through the bloom chain and the encoder', () => {
    const scene = renderCpuScene(defaultSettings, size);
    const expected = encodeFrame(scene, computeGlow(scene, size), defaultSettings, size, {
      dither: true,
    });
    expect(renderCpuImage(defaultSettings, size)).toEqual(expected);
  }, 30_000);

  it('skips the bloom chain at zero strength', () => {
    const settings = mergeSettings(defaultSettings, { bloomStrength: 0 });
    const scene = renderCpuScene(settings, size);
    expect(renderCpuImage(settings, size)).toEqual(
      encodeFrame(scene, null, settings, size, { dither: true }),
    );
  });

  it('shows the black hole shadow in the centre and light elsewhere', () => {
    const image = renderCpuImage(mergeSettings(defaultSettings, { bloomStrength: 0 }), size);
    const centre = (12 * size.width + 12) * 4;
    expect(image.subarray(centre, centre + 3).every((channel) => channel <= 1)).toBe(true);
    let lit = 0;
    for (let index = 0; index < image.length; index += 4) {
      if ((image[index] ?? 0) + (image[index + 1] ?? 0) + (image[index + 2] ?? 0) > 60) {
        lit += 1;
      }
    }
    expect(lit).toBeGreaterThan(20);
  });

  it('is deterministic', () => {
    expect(renderCpuImage(defaultSettings, size)).toEqual(renderCpuImage(defaultSettings, size));
  });
});
