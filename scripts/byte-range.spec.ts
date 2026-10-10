import { describe, expect, it } from 'vitest';
import { selectByteRange } from './byte-range.ts';

describe('selectByteRange', () => {
  it('serves the whole file without a range header', () => {
    expect(selectByteRange(undefined, 100)).toEqual({ kind: 'whole' });
  });

  it('serves the whole file for headers it does not understand', () => {
    for (const header of ['items=0-5', 'bytes=0-5,10-20', 'bytes=-', 'bytes=a-b', '']) {
      expect(selectByteRange(header, 100)).toEqual({ kind: 'whole' });
    }
  });

  it('selects a closed range', () => {
    expect(selectByteRange('bytes=10-19', 100)).toEqual({ kind: 'partial', start: 10, end: 19 });
  });

  it('clips the end of a range to the file size', () => {
    expect(selectByteRange('bytes=90-500', 100)).toEqual({ kind: 'partial', start: 90, end: 99 });
  });

  it('selects an open ended range up to the last byte', () => {
    expect(selectByteRange('bytes=0-', 100)).toEqual({ kind: 'partial', start: 0, end: 99 });
    expect(selectByteRange('bytes=40-', 100)).toEqual({ kind: 'partial', start: 40, end: 99 });
  });

  it('selects the last bytes of a suffix range', () => {
    expect(selectByteRange('bytes=-10', 100)).toEqual({ kind: 'partial', start: 90, end: 99 });
    expect(selectByteRange('bytes=-500', 100)).toEqual({ kind: 'partial', start: 0, end: 99 });
  });

  it('refuses ranges that start past the end', () => {
    expect(selectByteRange('bytes=100-', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(selectByteRange('bytes=200-300', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(selectByteRange('bytes=-0', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(selectByteRange('bytes=-5', 0)).toEqual({ kind: 'unsatisfiable' });
  });

  it('ignores a range whose end comes before its start', () => {
    expect(selectByteRange('bytes=20-10', 100)).toEqual({ kind: 'whole' });
  });
});
