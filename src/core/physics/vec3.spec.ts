import { add, angleBetween, cross, dot, length, normalize, scale, subtract, vec3 } from './vec3';

describe('vec3', () => {
  it('adds, subtracts and scales componentwise', () => {
    expect(add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual(vec3(5, 7, 9));
    expect(subtract(vec3(4, 5, 6), vec3(1, 2, 3))).toEqual(vec3(3, 3, 3));
    expect(scale(vec3(1, -2, 3), 2)).toEqual(vec3(2, -4, 6));
  });

  it('computes dot and cross products with the right-hand rule', () => {
    expect(dot(vec3(1, 2, 3), vec3(4, -5, 6))).toBe(12);
    expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual(vec3(0, 0, 1));
    expect(cross(vec3(0, 1, 0), vec3(0, 0, 1))).toEqual(vec3(1, 0, 0));
    expect(cross(vec3(0, 0, 1), vec3(1, 0, 0))).toEqual(vec3(0, 1, 0));
  });

  it('normalizes and rejects the zero vector', () => {
    expect(length(normalize(vec3(3, 4, 12)))).toBeCloseTo(1, 15);
    expect(() => normalize(vec3(0, 0, 0))).toThrow(RangeError);
  });

  it('measures angles stably for tiny and straight angles', () => {
    expect(angleBetween(vec3(1, 0, 0), vec3(0, 1, 0))).toBeCloseTo(Math.PI / 2, 15);
    expect(angleBetween(vec3(1, 0, 0), vec3(-1, 0, 0))).toBeCloseTo(Math.PI, 15);
    expect(angleBetween(vec3(1, 0, 0), vec3(1, 1e-9, 0))).toBeCloseTo(1e-9, 20);
  });
});
