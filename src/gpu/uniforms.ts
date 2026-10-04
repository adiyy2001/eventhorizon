import { type ViewportSize } from '../core/physics/observer';
import {
  viewBasis,
  viewDisk,
  viewHalfExtents,
  viewTraceOptions,
  type ViewDescription,
} from '../core/render/view';
import { type FieldDefinition, layoutStruct, type StructLayout, typeLayout } from './wgsl-layout';

export const traceParamsDefinition: readonly FieldDefinition[] = [
  { name: 'cameraPosition', type: 'vec3f' },
  { name: 'observerDistance', type: 'f32' },
  { name: 'cameraForward', type: 'vec3f' },
  { name: 'halfWidth', type: 'f32' },
  { name: 'cameraRight', type: 'vec3f' },
  { name: 'halfHeight', type: 'f32' },
  { name: 'cameraUp', type: 'vec3f' },
  { name: 'jitterX', type: 'f32' },
  { name: 'width', type: 'u32' },
  { name: 'height', type: 'u32' },
  { name: 'jitterY', type: 'f32' },
  { name: 'captureMargin', type: 'f32' },
  { name: 'diskInner', type: 'f32' },
  { name: 'diskOuter', type: 'f32' },
  { name: 'escapeRadius', type: 'f32' },
  { name: 'stepKappa', type: 'f32' },
  { name: 'stepAngularWeight', type: 'f32' },
  { name: 'stepMin', type: 'f32' },
  { name: 'stepMax', type: 'f32' },
  { name: 'maxSteps', type: 'u32' },
  { name: 'maxCrossings', type: 'u32' },
  { name: 'flags', type: 'u32' },
  { name: 'rayCount', type: 'u32' },
  { name: 'padding', type: 'u32' },
];

export const traceParamsLayout: StructLayout = layoutStruct(traceParamsDefinition);

export const traceFlags = {
  lensing: 1,
  higherOrder: 2,
  disk: 4,
  gravitational: 8,
  doppler: 16,
} as const;

export interface TraceParamsInput {
  view: ViewDescription;
  size: ViewportSize;
  jitter: { x: number; y: number };
  rayCount: number;
}

export function flagsForView(view: ViewDescription, withDisk: boolean): number {
  let flags = 0;
  if (view.lensing) {
    flags |= traceFlags.lensing;
  }
  if (view.higherOrderImages) {
    flags |= traceFlags.higherOrder;
  }
  if (withDisk) {
    flags |= traceFlags.disk;
  }
  if (view.gravitationalRedshift) {
    flags |= traceFlags.gravitational;
  }
  if (view.doppler) {
    flags |= traceFlags.doppler;
  }
  return flags;
}

export function traceParamValues(input: TraceParamsInput): Record<string, number> {
  const { view, size } = input;
  const basis = viewBasis(view);
  const options = viewTraceOptions(view);
  const disk = viewDisk(view);
  const extents = viewHalfExtents(view, size);
  return {
    'cameraPosition.x': basis.position.x,
    'cameraPosition.y': basis.position.y,
    'cameraPosition.z': basis.position.z,
    observerDistance: view.distance,
    'cameraForward.x': basis.forward.x,
    'cameraForward.y': basis.forward.y,
    'cameraForward.z': basis.forward.z,
    halfWidth: extents.halfWidth,
    'cameraRight.x': basis.right.x,
    'cameraRight.y': basis.right.y,
    'cameraRight.z': basis.right.z,
    halfHeight: extents.halfHeight,
    'cameraUp.x': basis.up.x,
    'cameraUp.y': basis.up.y,
    'cameraUp.z': basis.up.z,
    jitterX: input.jitter.x,
    width: size.width,
    height: size.height,
    jitterY: input.jitter.y,
    captureMargin: options.captureMargin,
    diskInner: disk.innerRadius,
    diskOuter: disk.outerRadius,
    escapeRadius: options.escapeRadius,
    stepKappa: options.step.kappa,
    stepAngularWeight: options.step.angularWeight,
    stepMin: options.step.minStep,
    stepMax: options.step.maxStep,
    maxSteps: options.maxSteps,
    maxCrossings: options.maxCrossings,
    flags: flagsForView(view, true),
    rayCount: input.rayCount,
    padding: 0,
  };
}

export function packTraceParams(input: TraceParamsInput): ArrayBuffer {
  const values = traceParamValues(input);
  const buffer = new ArrayBuffer(traceParamsLayout.size);
  const view = new DataView(buffer);
  for (const field of traceParamsLayout.fields) {
    const components = typeLayout(field.type).components;
    for (let component = 0; component < components; component += 1) {
      const key = components === 1 ? field.name : `${field.name}.${'xyzw'[component] ?? 'x'}`;
      const value = values[key];
      if (value === undefined) {
        throw new RangeError(`no value for ${key}`);
      }
      const offset = field.offset + component * 4;
      if (field.type === 'f32' || field.type.endsWith('f')) {
        view.setFloat32(offset, value, true);
      } else {
        view.setUint32(offset, value, true);
      }
    }
  }
  return buffer;
}
