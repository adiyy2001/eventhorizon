import { shadowTangentRadius } from '../physics/shadow';
import { renderReferenceImage } from './reference-image';
import { defaultView, viewHalfExtents } from './view';

describe('shadow edge overlay against the CPU reference image', () => {
  it.each([30, 50])(
    'has the radius of the captured region within 1 percent for D = %d',
    (distance) => {
      const view = { ...defaultView, distance, inclination: (10 * Math.PI) / 180 };
      const size = { width: 160, height: 160 };
      const image = renderReferenceImage(view, size);
      let captured = 0;
      for (const outcome of image.outcomes) {
        if (outcome === 0) {
          captured += 1;
        }
      }
      const measuredRadiusPixels = Math.sqrt(captured / Math.PI);
      const { halfHeight } = viewHalfExtents(view, size);
      const overlayRadiusPixels = (shadowTangentRadius(distance) / halfHeight) * (size.height / 2);
      expect(Math.abs(measuredRadiusPixels / overlayRadiusPixels - 1)).toBeLessThan(0.01);
    },
    120_000,
  );
});
