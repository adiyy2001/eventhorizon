import { diskTemperature } from '../physics/disk';
import { checkerBright, checkerDark, checkerShade, diskShade } from './placeholder-shade';

describe('checkerShade', () => {
  it('alternates between two levels across cell borders', () => {
    const bright = checkerShade(1, 0.05, 0.05);
    const neighbour = checkerShade(Math.cos(0.9), 0.05, Math.sin(0.9));
    expect([bright, neighbour].sort()).toEqual([checkerDark, checkerBright].sort());
  });

  it('is defined at the poles', () => {
    expect([checkerBright, checkerDark]).toContain(checkerShade(0, 1, 0));
    expect([checkerBright, checkerDark]).toContain(checkerShade(0, -1, 0));
  });
});

describe('diskShade', () => {
  const both = { gravitational: true, doppler: true };
  const neither = { gravitational: false, doppler: false };

  it('is the fourth power of the observed temperature ratio', () => {
    const radius = 10;
    const ratio = diskTemperature(radius, 6, 1);
    expect(diskShade(radius, 0, 30, 6, neither)).toBeCloseTo(ratio ** 4, 12);
  });

  it('vanishes at the inner edge', () => {
    expect(diskShade(6, 0, 30, 6, both)).toBe(0);
  });

  it('is brighter on the approaching side', () => {
    const approaching = diskShade(8, 3, 30, 6, both);
    const receding = diskShade(8, -3, 30, 6, both);
    expect(approaching).toBeGreaterThan(receding);
  });
});
