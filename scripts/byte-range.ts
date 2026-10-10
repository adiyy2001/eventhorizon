export type ByteRangeSelection =
  { kind: 'whole' } | { kind: 'partial'; start: number; end: number } | { kind: 'unsatisfiable' };

const rangePattern = /^bytes=(\d*)-(\d*)$/;

export function selectByteRange(header: string | undefined, size: number): ByteRangeSelection {
  const match = header === undefined ? null : rangePattern.exec(header.trim());
  if (match === null) {
    return { kind: 'whole' };
  }
  const first = match[1] ?? '';
  const last = match[2] ?? '';
  if (first === '' && last === '') {
    return { kind: 'whole' };
  }
  if (first === '') {
    const length = Number(last);
    return length === 0 || size === 0
      ? { kind: 'unsatisfiable' }
      : { kind: 'partial', start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(first);
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  if (start >= size) {
    return { kind: 'unsatisfiable' };
  }
  return end < start ? { kind: 'whole' } : { kind: 'partial', start, end };
}
