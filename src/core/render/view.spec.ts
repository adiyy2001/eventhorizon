import { ISCO_RADIUS } from '../physics/constants';
import {
  defaultView,
  viewBasis,
  viewDisk,
  viewHalfExtents,
  viewMaxSteps,
  viewTraceOptions,
} from './view';

describe('view helpers', () => {
  it('places the disk between the ISCO and the configured outer radius', () => {
    expect(viewDisk({ ...defaultView, diskOuterRadius: 14 })).toEqual({
      innerRadius: ISCO_RADIUS,
      outerRadius: 14,
    });
  });

  it('turns the switches into trace options with the shared step budget', () => {
    const options = viewTraceOptions({ ...defaultView, lensing: false, higherOrderImages: false });
    expect(options.lensing).toBe(false);
    expect(options.higherOrderImages).toBe(false);
    expect(options.maxSteps).toBe(viewMaxSteps);
    expect(options.escapeRadius).toBe(100);
  });

  it('puts the camera at the configured distance and inclination', () => {
    const basis = viewBasis(defaultView);
    expect(Math.hypot(basis.position.x, basis.position.y, basis.position.z)).toBeCloseTo(
      defaultView.distance,
      12,
    );
    expect(basis.position.y / defaultView.distance).toBeCloseTo(
      Math.cos(defaultView.inclination),
      12,
    );
  });

  it('scales the horizontal half extent by the aspect ratio', () => {
    const extents = viewHalfExtents(defaultView, { width: 300, height: 100 });
    expect(extents.halfWidth).toBeCloseTo(3 * extents.halfHeight, 12);
    expect(extents.halfHeight).toBeCloseTo(Math.tan(0.5 * defaultView.verticalFieldOfView), 12);
  });
});
