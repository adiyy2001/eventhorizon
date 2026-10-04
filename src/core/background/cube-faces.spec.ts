import { normalize, vec3 } from '../physics/vec3';
import {
  CUBE_FACES,
  FACE_COUNT,
  cubeFace,
  dominantFace,
  faceCoordinates,
  faceDirection,
  texelCenterCoordinate,
  texelDirection,
} from './cube-faces';

describe('cube faces', () => {
  it('has six faces with orthonormal frames', () => {
    expect(FACE_COUNT).toBe(6);
    for (const face of CUBE_FACES) {
      const { forward, uAxis, vAxis } = face;
      expect(forward.x * uAxis.x + forward.y * uAxis.y + forward.z * uAxis.z).toBe(0);
      expect(forward.x * vAxis.x + forward.y * vAxis.y + forward.z * vAxis.z).toBe(0);
      expect(uAxis.x * vAxis.x + uAxis.y * vAxis.y + uAxis.z * vAxis.z).toBe(0);
    }
  });

  it('rejects a face that does not exist', () => {
    expect(() => cubeFace(6)).toThrow(RangeError);
  });

  it('follows the major axis table of the cube map specification', () => {
    const direction = normalize(vec3(1, 0.3, -0.5));
    const { u, v } = faceCoordinates(0, direction);
    expect(u).toBeCloseTo(0.5, 12);
    expect(v).toBeCloseTo(-0.3, 12);
    const up = faceCoordinates(2, normalize(vec3(0.2, 1, 0.6)));
    expect(up.u).toBeCloseTo(0.2, 12);
    expect(up.v).toBeCloseTo(0.6, 12);
  });

  it('round trips face coordinates through directions', () => {
    for (let face = 0; face < FACE_COUNT; face += 1) {
      for (const [u, v] of [
        [0, 0],
        [0.7, -0.4],
        [-1, 1],
      ] as const) {
        const back = faceCoordinates(face, faceDirection(face, u, v));
        expect(back.u).toBeCloseTo(u, 12);
        expect(back.v).toBeCloseTo(v, 12);
        expect(dominantFace(faceDirection(face, u * 0.9, v * 0.9))).toBe(face);
      }
    }
  });

  it('places texel centers symmetrically', () => {
    expect(texelCenterCoordinate(0, 4)).toBeCloseTo(-0.75, 12);
    expect(texelCenterCoordinate(3, 4)).toBeCloseTo(0.75, 12);
    const direction = texelDirection(4, 1, 2, 4);
    expect(direction.z).toBeGreaterThan(0);
  });
});
