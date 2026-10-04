import { normalize, vec3 } from '../physics/vec3';
import { NEBULA_BAND_NORMAL, nebulaRadiance, smoothstepRange } from './nebula';

function fibonacciSphere(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const height = 1 - (2 * (index + 0.5)) / count;
    const radius = Math.sqrt(1 - height * height);
    const angle = index * 2.399963229728653;
    return vec3(radius * Math.cos(angle), height, radius * Math.sin(angle));
  });
}

describe('nebula', () => {
  const directions = fibonacciSphere(1500);

  it('is finite, non-negative and dim compared with the disk', () => {
    for (const direction of directions) {
      const radiance = nebulaRadiance(direction);
      for (const channel of radiance) {
        expect(Number.isFinite(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThan(0.2);
      }
    }
  });

  it('is brighter near the galactic band than at its poles', () => {
    let inside = 0;
    let insideCount = 0;
    let outside = 0;
    let outsideCount = 0;
    for (const direction of directions) {
      const offset = Math.abs(
        direction.x * NEBULA_BAND_NORMAL.x +
          direction.y * NEBULA_BAND_NORMAL.y +
          direction.z * NEBULA_BAND_NORMAL.z,
      );
      const radiance = nebulaRadiance(direction);
      const luminance = radiance[0] + radiance[1] + radiance[2];
      if (offset < 0.2) {
        inside += luminance;
        insideCount += 1;
      } else if (offset > 0.8) {
        outside += luminance;
        outsideCount += 1;
      }
    }
    expect(inside / insideCount).toBeGreaterThan(2 * (outside / outsideCount));
  });

  it('is deterministic and varies across the sky', () => {
    const direction = normalize(vec3(0.2, 0.5, -0.8));
    expect(nebulaRadiance(direction)).toEqual(nebulaRadiance(direction));
    const values = new Set(directions.slice(0, 50).map((entry) => nebulaRadiance(entry)[0]));
    expect(values.size).toBeGreaterThan(40);
  });

  it('has both warm and cool regions', () => {
    let warm = 0;
    let cool = 0;
    for (const direction of directions) {
      const [red, , blue] = nebulaRadiance(direction);
      if (red > 1.5 * blue && red > 0.01) {
        warm += 1;
      }
      if (blue > 1.5 * red && blue > 0.01) {
        cool += 1;
      }
    }
    expect(warm).toBeGreaterThan(0);
    expect(cool).toBeGreaterThan(0);
  });
});

describe('smoothstep', () => {
  it('clamps and matches the cubic Hermite form', () => {
    expect(smoothstepRange(0.2, 0.6, 0)).toBe(0);
    expect(smoothstepRange(0.2, 0.6, 1)).toBe(1);
    expect(smoothstepRange(0.2, 0.6, 0.4)).toBeCloseTo(0.5, 12);
  });
});
