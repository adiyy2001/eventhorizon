import { buildTemperatureLut, sampleLut } from '../color/temperature-lut';
import { type Vec3, normalize, vec3 } from '../physics/vec3';
import { createMulberry32 } from '../validation/prng';
import { FACE_COUNT, faceCoordinates } from './cube-faces';
import {
  STAR_CELLS_PER_EDGE,
  STAR_PEAK_MAX,
  STAR_PEAK_MIN,
  STAR_SIGMA,
  STAR_TEMPERATURE_MIN,
  STAR_TEMPERATURE_RATIO,
  allStars,
  starInCell,
  starRadiance,
  starWeight,
} from './stars';

const lut = buildTemperatureLut();
const stars = allStars();

function bruteForceRadiance(direction: Vec3): [number, number, number] {
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const star of stars) {
    const weight = starWeight(direction, star) * star.peak;
    if (weight > 0) {
      const color = sampleLut(lut, star.temperature);
      red += color[0] * weight;
      green += color[1] * weight;
      blue += color[2] * weight;
    }
  }
  return [red, green, blue];
}

function randomUnitVector(random: () => number): Vec3 {
  const height = 2 * random() - 1;
  const angle = 2 * Math.PI * random();
  const radius = Math.sqrt(1 - height * height);
  return vec3(radius * Math.cos(angle), height, radius * Math.sin(angle));
}

function minorComponent(direction: Vec3): number {
  return Math.min(Math.abs(direction.x), Math.abs(direction.y), Math.abs(direction.z));
}

function majorComponent(direction: Vec3): number {
  return Math.max(Math.abs(direction.x), Math.abs(direction.y), Math.abs(direction.z));
}

function secondComponent(direction: Vec3): number {
  return (
    [Math.abs(direction.x), Math.abs(direction.y), Math.abs(direction.z)].sort(
      (left, right) => right - left,
    )[1] ?? 0
  );
}

describe('star field', () => {
  it('places thousands of stars with a skewed brightness distribution', () => {
    expect(stars.length).toBeGreaterThan(4000);
    expect(stars.length).toBeLessThan(16000);
    const bright = stars.filter((star) => star.peak > 0.6).length;
    const dim = stars.filter((star) => star.peak < 0.12).length;
    expect(dim).toBeGreaterThan(2 * bright);
    for (const star of stars) {
      expect(star.peak).toBeGreaterThanOrEqual(STAR_PEAK_MIN);
      expect(star.peak).toBeLessThanOrEqual(STAR_PEAK_MAX);
      expect(star.temperature).toBeGreaterThanOrEqual(STAR_TEMPERATURE_MIN);
      expect(star.temperature).toBeLessThanOrEqual(
        STAR_TEMPERATURE_MIN * STAR_TEMPERATURE_RATIO + 1,
      );
    }
  });

  it('is deterministic', () => {
    expect(starInCell(2, 10, 20)).toEqual(starInCell(2, 10, 20));
  });

  it('spreads stars evenly over the sphere despite the cube parameterisation', () => {
    const random = createMulberry32(5);
    const samples = 200000;
    let cornerSamples = 0;
    let centerSamples = 0;
    for (let index = 0; index < samples; index += 1) {
      const direction = randomUnitVector(random);
      cornerSamples += minorComponent(direction) > 0.45 ? 1 : 0;
      centerSamples += majorComponent(direction) > 0.9 ? 1 : 0;
    }
    const cornerStars = stars.filter((star) => minorComponent(star.direction) > 0.45).length;
    const centerStars = stars.filter((star) => majorComponent(star.direction) > 0.9).length;
    const cornerExpected = (cornerSamples / samples) * stars.length;
    const centerExpected = (centerSamples / samples) * stars.length;
    expect(Math.abs(cornerStars - cornerExpected) / cornerExpected).toBeLessThan(0.12);
    expect(Math.abs(centerStars - centerExpected) / centerExpected).toBeLessThan(0.12);
  });

  it('keeps every star inside its own cell', () => {
    for (let face = 0; face < FACE_COUNT; face += 1) {
      for (let row = 0; row < STAR_CELLS_PER_EDGE; row += 7) {
        for (let column = 0; column < STAR_CELLS_PER_EDGE; column += 5) {
          const star = starInCell(face, column, row);
          if (star === null) {
            continue;
          }
          const coordinates = faceCoordinates(face, star.direction);
          const cellColumn = Math.floor(((coordinates.u + 1) / 2) * STAR_CELLS_PER_EDGE);
          const cellRow = Math.floor(((coordinates.v + 1) / 2) * STAR_CELLS_PER_EDGE);
          expect(cellColumn).toBe(column);
          expect(cellRow).toBe(row);
        }
      }
    }
  });

  it('returns a colour with the hue of the star temperature', () => {
    const star = stars.find((entry) => entry.temperature < 3200 && entry.peak > 0.1);
    expect(star).toBeDefined();
    if (star === undefined) {
      return;
    }
    const color = starRadiance(star.direction, lut);
    expect(color[0]).toBeGreaterThan(color[2]);
    const hot = stars.find((entry) => entry.temperature > 12000 && entry.peak > 0.1);
    if (hot !== undefined) {
      const hotColor = starRadiance(hot.direction, lut);
      expect(hotColor[2]).toBeGreaterThan(hotColor[0]);
    }
  });

  it('agrees with a brute force sum over every star, also across face seams and corners', () => {
    const random = createMulberry32(77);
    const nearSeam = stars.filter(
      (star) => majorComponent(star.direction) - secondComponent(star.direction) < 0.01,
    );
    expect(nearSeam.length).toBeGreaterThan(10);
    const pool = [...nearSeam.slice(0, 150), ...stars.filter((_, index) => index % 40 === 0)];
    for (const star of pool) {
      const probe = normalize(
        vec3(
          star.direction.x + (random() - 0.5) * 4 * STAR_SIGMA,
          star.direction.y + (random() - 0.5) * 4 * STAR_SIGMA,
          star.direction.z + (random() - 0.5) * 4 * STAR_SIGMA,
        ),
      );
      const fast = starRadiance(probe, lut);
      const reference = bruteForceRadiance(probe);
      for (let channel = 0; channel < 3; channel += 1) {
        expect(fast[channel]).toBeCloseTo(reference[channel] ?? 0, 9);
      }
    }
  });

  it('is zero far from every star', () => {
    expect(
      starRadiance(normalize(vec3(0.123, 0.456, 0.789)), lut).every((value) => value >= 0),
    ).toBe(true);
  });
});
