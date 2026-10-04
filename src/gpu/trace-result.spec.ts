import constantsSource from './shaders/constants.wgsl';
import { recordsFromBuffer, traceResultBytes, traceResultLayout } from './trace-result';
import { parseStructDefinition } from './wgsl-layout';

describe('TraceResult layout', () => {
  it('matches the struct declared in the WGSL source', () => {
    const declared = parseStructDefinition(constantsSource, 'TraceResult');
    expect(traceResultLayout.fields.map(({ name, type }) => ({ name, type }))).toEqual(declared);
  });

  it('places every field at its hand-computed offset', () => {
    const offsets = Object.fromEntries(
      traceResultLayout.fields.map((field) => [field.name, field.offset]),
    );
    expect(offsets).toEqual({
      outcome: 0,
      steps: 4,
      crossings: 8,
      flags: 12,
      direction: 16,
      hitRadius: 28,
      hitLambda: 32,
      hitX: 36,
      hitZ: 40,
      hitIndex: 44,
    });
    expect(traceResultBytes).toBe(48);
  });
});

describe('recordsFromBuffer', () => {
  it('reads two records back', () => {
    const buffer = new ArrayBuffer(2 * traceResultBytes);
    const view = new DataView(buffer);
    view.setUint32(0, 2, true);
    view.setUint32(4, 120, true);
    view.setUint32(8, 3, true);
    view.setFloat32(28, 7.5, true);
    view.setFloat32(32, -1.25, true);
    view.setUint32(44, 2, true);
    const second = traceResultBytes;
    view.setUint32(second, 1, true);
    view.setUint32(second + 12, 1, true);
    view.setFloat32(second + 16, 0, true);
    view.setFloat32(second + 20, 1, true);
    view.setFloat32(second + 24, 0, true);
    const [first, next] = recordsFromBuffer(buffer, 2);
    expect(first).toMatchObject({
      outcome: 2,
      steps: 120,
      crossings: 3,
      hitRadius: 7.5,
      hitLambda: -1.25,
      hitIndex: 2,
      stepLimitReached: false,
    });
    expect(next?.outcome).toBe(1);
    expect(next?.stepLimitReached).toBe(true);
    expect(next?.direction).toEqual([0, 1, 0]);
  });
});
