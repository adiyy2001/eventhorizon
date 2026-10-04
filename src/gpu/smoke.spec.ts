import { countMatchingValues, expectedSmokeValues, workgroupCount } from './smoke';

describe('smoke helpers', () => {
  it('computes the values the kernel writes', () => {
    expect(Array.from(expectedSmokeValues(4))).toEqual([7, 8, 11, 16]);
  });

  it('counts matching values and ignores differences', () => {
    expect(countMatchingValues([7, 8, 0, 16], [7, 8, 11, 16])).toBe(3);
    expect(countMatchingValues([], [1, 2])).toBe(0);
  });

  it('rounds the workgroup count up', () => {
    expect(workgroupCount(64, 64)).toBe(1);
    expect(workgroupCount(65, 64)).toBe(2);
    expect(workgroupCount(1000, 64)).toBe(16);
  });
});
