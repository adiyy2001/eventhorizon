export function relativeError(value: number, reference: number): number {
  return Math.abs(value - reference) / Math.abs(reference);
}

export function maxOf(values: readonly number[]): number {
  return values.reduce((largest, value) => Math.max(largest, value), 0);
}

export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    throw new RangeError('percentile of an empty list');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(fraction * (sorted.length - 1))),
  );
  return sorted[position] ?? 0;
}
