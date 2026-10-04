import { type RayRecord } from '../core/validation/parity';
import { layoutStruct } from './wgsl-layout';

export const traceResultLayout = layoutStruct([
  { name: 'outcome', type: 'u32' },
  { name: 'steps', type: 'u32' },
  { name: 'crossings', type: 'u32' },
  { name: 'flags', type: 'u32' },
  { name: 'direction', type: 'vec3f' },
  { name: 'hitRadius', type: 'f32' },
  { name: 'hitLambda', type: 'f32' },
  { name: 'hitX', type: 'f32' },
  { name: 'hitZ', type: 'f32' },
  { name: 'hitIndex', type: 'u32' },
]);

export const traceResultBytes = traceResultLayout.size;

const stepLimitFlag = 1;

export function recordsFromBuffer(buffer: ArrayBuffer, count: number): RayRecord[] {
  const words = new DataView(buffer);
  const offsetOf = (name: string): number => {
    const field = traceResultLayout.fields.find((candidate) => candidate.name === name);
    if (field === undefined) {
      throw new RangeError(`unknown field ${name}`);
    }
    return field.offset;
  };
  const outcome = offsetOf('outcome');
  const steps = offsetOf('steps');
  const crossings = offsetOf('crossings');
  const flags = offsetOf('flags');
  const direction = offsetOf('direction');
  const hitRadius = offsetOf('hitRadius');
  const hitLambda = offsetOf('hitLambda');
  const hitIndex = offsetOf('hitIndex');
  return Array.from({ length: count }, (_, index): RayRecord => {
    const base = index * traceResultBytes;
    return {
      outcome: words.getUint32(base + outcome, true),
      steps: words.getUint32(base + steps, true),
      crossings: words.getUint32(base + crossings, true),
      stepLimitReached: (words.getUint32(base + flags, true) & stepLimitFlag) !== 0,
      direction: [
        words.getFloat32(base + direction, true),
        words.getFloat32(base + direction + 4, true),
        words.getFloat32(base + direction + 8, true),
      ],
      hitRadius: words.getFloat32(base + hitRadius, true),
      hitLambda: words.getFloat32(base + hitLambda, true),
      hitIndex: words.getUint32(base + hitIndex, true),
    };
  });
}
