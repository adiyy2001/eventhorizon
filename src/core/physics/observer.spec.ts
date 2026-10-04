import { SCHWARZSCHILD_RADIUS } from './constants';
import { impactParameter, nullDrift, radiusOf } from './geodesic';
import {
  angleForImpactParameter,
  cameraBasis,
  directionAtAngle,
  impactParameterAtAngle,
  pixelDirection,
  staticObserverRay,
} from './observer';
import { dot, length, vec3 } from './vec3';

const setup = {
  distance: 30,
  inclination: (75 * Math.PI) / 180,
  azimuth: 0.4,
  verticalFieldOfView: (35 * Math.PI) / 180,
};

describe('cameraBasis', () => {
  it('builds an orthonormal right-handed frame looking at the hole', () => {
    const basis = cameraBasis(setup);
    expect(length(basis.position)).toBeCloseTo(30, 12);
    expect(length(basis.forward)).toBeCloseTo(1, 14);
    expect(dot(basis.forward, basis.right)).toBeCloseTo(0, 14);
    expect(dot(basis.forward, basis.up)).toBeCloseTo(0, 14);
    expect(dot(basis.right, basis.up)).toBeCloseTo(0, 14);
    expect(dot(basis.forward, basis.position)).toBeCloseTo(-30, 12);
  });

  it('puts a face-on camera on the disk axis and an edge-on camera in the plane', () => {
    const faceOn = cameraBasis({ ...setup, inclination: 0 });
    expect(faceOn.position.x).toBeCloseTo(0, 12);
    expect(faceOn.position.y).toBeCloseTo(30, 12);
    const edgeOn = cameraBasis({ ...setup, inclination: Math.PI / 2 });
    expect(edgeOn.position.y).toBeCloseTo(0, 12);
    expect(edgeOn.up.y).toBeCloseTo(1, 12);
  });

  it('rejects an observer on or inside the horizon', () => {
    expect(() => cameraBasis({ ...setup, distance: SCHWARZSCHILD_RADIUS })).toThrow(RangeError);
    expect(() => staticObserverRay(vec3(1.5, 0, 0), vec3(1, 0, 0))).toThrow(RangeError);
  });
});

describe('pixelDirection', () => {
  const basis = cameraBasis(setup);
  const viewport = { width: 200, height: 100 };

  it('looks along the forward axis at the image center', () => {
    const direction = pixelDirection(basis, setup.verticalFieldOfView, viewport, 100, 50);
    expect(dot(direction, basis.forward)).toBeCloseTo(1, 14);
  });

  it('spans the vertical field of view from the top to the bottom edge', () => {
    const top = pixelDirection(basis, setup.verticalFieldOfView, viewport, 100, 0);
    const bottom = pixelDirection(basis, setup.verticalFieldOfView, viewport, 100, 100);
    expect(Math.acos(dot(top, bottom))).toBeCloseTo(setup.verticalFieldOfView, 12);
    expect(dot(top, basis.up)).toBeGreaterThan(0);
  });

  it('maps the right edge to the right axis with the aspect ratio applied', () => {
    const right = pixelDirection(basis, setup.verticalFieldOfView, viewport, 200, 50);
    const expected = Math.atan(Math.tan(0.5 * setup.verticalFieldOfView) * 2);
    expect(Math.acos(dot(right, basis.forward))).toBeCloseTo(expected, 12);
    expect(dot(right, basis.right)).toBeGreaterThan(0);
  });
});

describe('staticObserverRay', () => {
  const basis = cameraBasis(setup);

  it('satisfies the null condition and the angular momentum formula', () => {
    for (const degrees of [0, 3, 9, 27, 60, 89]) {
      const angle = (degrees * Math.PI) / 180;
      const ray = staticObserverRay(basis.position, directionAtAngle(basis, angle));
      expect(Math.abs(nullDrift(ray))).toBeLessThan(1e-14);
      expect(impactParameter(ray)).toBeCloseTo(impactParameterAtAngle(30, angle), 12);
      expect(radiusOf(ray)).toBeCloseTo(30, 12);
    }
  });

  it('is radial for a ray pointing straight at the hole and straight away', () => {
    const inward = staticObserverRay(basis.position, basis.forward);
    expect(
      inward.vx * basis.position.x + inward.vy * basis.position.y + inward.vz * basis.position.z,
    ).toBeLessThan(0);
    expect(length(vec3(inward.vx, inward.vy, inward.vz))).toBeCloseTo(1, 14);
    const outward = staticObserverRay(
      basis.position,
      vec3(-basis.forward.x, -basis.forward.y, -basis.forward.z),
    );
    expect(
      outward.vx * basis.position.x + outward.vy * basis.position.y + outward.vz * basis.position.z,
    ).toBeGreaterThan(0);
  });

  it('has no radial motion at 90 degrees to the line of sight', () => {
    const ray = staticObserverRay(basis.position, directionAtAngle(basis, Math.PI / 2));
    const radial =
      (ray.vx * basis.position.x + ray.vy * basis.position.y + ray.vz * basis.position.z) / 30;
    expect(Math.abs(radial)).toBeLessThan(1e-7);
  });

  it('inverts the angle and impact parameter conversion', () => {
    const angle = angleForImpactParameter(30, 6.5);
    expect(impactParameterAtAngle(30, angle)).toBeCloseTo(6.5, 13);
  });
});
