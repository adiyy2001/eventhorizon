import { paddedBytesPerRow, rayBuffer, removeRowPadding, workgroupCount } from './rows';

describe('paddedBytesPerRow', () => {
  it('rounds up to 256 bytes', () => {
    expect(paddedBytesPerRow(64, 4)).toBe(256);
    expect(paddedBytesPerRow(65, 4)).toBe(512);
    expect(paddedBytesPerRow(128, 16)).toBe(2048);
    expect(paddedBytesPerRow(1, 4)).toBe(256);
  });
});

describe('removeRowPadding', () => {
  it('keeps only the pixel bytes of every row', () => {
    const width = 3;
    const height = 2;
    const stride = paddedBytesPerRow(width, 4);
    const padded = new Uint8Array(stride * height).fill(255);
    for (let row = 0; row < height; row += 1) {
      for (let byte = 0; byte < width * 4; byte += 1) {
        padded[row * stride + byte] = row * 100 + byte;
      }
    }
    const packed = removeRowPadding(padded, width, height, 4);
    expect(packed).toHaveLength(24);
    expect([...packed.subarray(0, 12)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect([...packed.subarray(12, 16)]).toEqual([100, 101, 102, 103]);
    expect(packed.includes(255)).toBe(false);
  });
});

describe('workgroupCount', () => {
  it('covers a partial last group', () => {
    expect(workgroupCount(128, 64)).toBe(2);
    expect(workgroupCount(129, 64)).toBe(3);
    expect(workgroupCount(1, 8)).toBe(1);
  });
});

describe('rayBuffer', () => {
  it('stores position then direction in two vec4 slots per ray', () => {
    const values = rayBuffer([
      { position: [1, 2, 3], direction: [4, 5, 6] },
      { position: [7, 8, 9], direction: [10, 11, 12] },
    ]);
    expect([...values]).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0, 10, 11, 12, 0]);
  });
});
