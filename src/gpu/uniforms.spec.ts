import { defaultView } from '../core/render/view';
import constantsSource from './shaders/constants.wgsl';
import {
  flagsForView,
  packTraceParams,
  traceFlags,
  traceParamsDefinition,
  traceParamsLayout,
  traceParamValues,
} from './uniforms';
import { parseStructDefinition, parseU32Constants } from './wgsl-layout';

const input = {
  view: defaultView,
  size: { width: 200, height: 100 },
  jitter: { x: 0.25, y: -0.25 },
  rayCount: 7,
};

function offsetOf(name: string): number {
  const field = traceParamsLayout.fields.find((candidate) => candidate.name === name);
  if (field === undefined) {
    throw new Error(`no field ${name}`);
  }
  return field.offset;
}

describe('TraceParams layout', () => {
  it('matches the struct declared in the WGSL source', () => {
    expect(parseStructDefinition(constantsSource, 'TraceParams')).toEqual(traceParamsDefinition);
  });

  it('places every field at its hand-computed offset', () => {
    const expected: Record<string, number> = {
      cameraPosition: 0,
      observerDistance: 12,
      cameraForward: 16,
      halfWidth: 28,
      cameraRight: 32,
      halfHeight: 44,
      cameraUp: 48,
      jitterX: 60,
      width: 64,
      height: 68,
      jitterY: 72,
      captureMargin: 76,
      diskInner: 80,
      diskOuter: 84,
      escapeRadius: 88,
      stepKappa: 92,
      stepAngularWeight: 96,
      stepMin: 100,
      stepMax: 104,
      maxSteps: 108,
      maxCrossings: 112,
      flags: 116,
      rayCount: 120,
      padding: 124,
    };
    for (const field of traceParamsLayout.fields) {
      expect(field.offset, field.name).toBe(expected[field.name]);
    }
    expect(traceParamsLayout.fields).toHaveLength(Object.keys(expected).length);
    expect(traceParamsLayout.size).toBe(128);
  });

  it('keeps the flag bits identical in TypeScript and WGSL', () => {
    const constants = parseU32Constants(constantsSource);
    expect(constants['FLAG_LENSING']).toBe(traceFlags.lensing);
    expect(constants['FLAG_HIGHER_ORDER']).toBe(traceFlags.higherOrder);
    expect(constants['FLAG_DISK']).toBe(traceFlags.disk);
    expect(constants['FLAG_GRAVITATIONAL']).toBe(traceFlags.gravitational);
    expect(constants['FLAG_DOPPLER']).toBe(traceFlags.doppler);
  });
});

describe('packTraceParams', () => {
  const buffer = packTraceParams(input);
  const view = new DataView(buffer);

  it('writes a buffer of exactly the struct size', () => {
    expect(buffer.byteLength).toBe(128);
  });

  it('writes the camera basis as float32', () => {
    const values = traceParamValues(input);
    expect(view.getFloat32(offsetOf('cameraPosition'), true)).toBeCloseTo(
      values['cameraPosition.x'] ?? Number.NaN,
      5,
    );
    expect(view.getFloat32(offsetOf('cameraPosition') + 4, true)).toBeCloseTo(
      values['cameraPosition.y'] ?? Number.NaN,
      5,
    );
    expect(view.getFloat32(offsetOf('observerDistance'), true)).toBe(30);
    expect(view.getFloat32(offsetOf('cameraUp') + 8, true)).toBeCloseTo(
      values['cameraUp.z'] ?? Number.NaN,
      5,
    );
  });

  it('derives the half extents from the field of view and the aspect ratio', () => {
    const halfHeight = Math.tan(0.5 * defaultView.verticalFieldOfView);
    expect(view.getFloat32(offsetOf('halfHeight'), true)).toBeCloseTo(halfHeight, 6);
    expect(view.getFloat32(offsetOf('halfWidth'), true)).toBeCloseTo(2 * halfHeight, 6);
  });

  it('writes sizes, jitter, limits and counts', () => {
    expect(view.getUint32(offsetOf('width'), true)).toBe(200);
    expect(view.getUint32(offsetOf('height'), true)).toBe(100);
    expect(view.getFloat32(offsetOf('jitterX'), true)).toBe(0.25);
    expect(view.getFloat32(offsetOf('jitterY'), true)).toBe(-0.25);
    expect(view.getUint32(offsetOf('maxSteps'), true)).toBe(4096);
    expect(view.getUint32(offsetOf('rayCount'), true)).toBe(7);
    expect(view.getFloat32(offsetOf('diskInner'), true)).toBe(6);
    expect(view.getFloat32(offsetOf('diskOuter'), true)).toBe(20);
    expect(view.getFloat32(offsetOf('escapeRadius'), true)).toBe(100);
    expect(view.getUint32(offsetOf('padding'), true)).toBe(0);
  });
});

describe('flagsForView', () => {
  it('sets one bit per enabled feature', () => {
    expect(flagsForView(defaultView, true)).toBe(31);
    expect(
      flagsForView(
        {
          ...defaultView,
          lensing: false,
          higherOrderImages: false,
          gravitationalRedshift: false,
          doppler: false,
        },
        false,
      ),
    ).toBe(0);
    expect(flagsForView({ ...defaultView, doppler: false }, true)).toBe(15);
    expect(flagsForView({ ...defaultView, gravitationalRedshift: false }, true)).toBe(23);
  });
});
