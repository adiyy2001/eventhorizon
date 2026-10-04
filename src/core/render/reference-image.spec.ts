import { OUTCOME_CODES } from '../validation/parity';
import { renderReferenceImage } from './reference-image';
import { defaultView } from './view';

describe('renderReferenceImage', () => {
  const size = { width: 32, height: 32 };
  const image = renderReferenceImage(defaultView, size);

  it('allocates one value per pixel', () => {
    expect(image.outcomes).toHaveLength(1024);
    expect(image.radiance).toHaveLength(3072);
    expect(image.hitRadius).toHaveLength(1024);
    expect(image.impactParameters).toHaveLength(1024);
  });

  it('shows a shadow in the middle and the sky or the disk elsewhere', () => {
    const center = 16 * 32 + 16;
    expect(image.outcomes[center]).toBe(OUTCOME_CODES.captured);
    expect(image.radiance.slice(center * 3, center * 3 + 3)).toEqual(new Float32Array(3));
    const counts = [0, 0, 0];
    image.outcomes.forEach((code) => {
      counts[code] = (counts[code] ?? 0) + 1;
    });
    expect(counts.every((count) => count > 0)).toBe(true);
  });

  it('records the hit radius and a non-negative radiance for every disk pixel', () => {
    image.outcomes.forEach((code, index) => {
      if (code === OUTCOME_CODES.disk) {
        expect(image.hitRadius[index]).toBeGreaterThanOrEqual(6);
        expect(image.hitRadius[index]).toBeLessThanOrEqual(20);
        expect(image.radiance[index * 3]).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('puts the center pixel at an impact parameter near zero', () => {
    expect(image.impactParameters[16 * 32 + 16]).toBeLessThan(1);
  });

  it('turns the shadow into a plain sky with lensing off and no disk in the way', () => {
    const flat = renderReferenceImage(
      { ...defaultView, lensing: false, higherOrderImages: false, inclination: 0 },
      size,
    );
    const centerCode = flat.outcomes[16 * 32 + 16];
    expect(centerCode).toBe(OUTCOME_CODES.captured);
  });
});
