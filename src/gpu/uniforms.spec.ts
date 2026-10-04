import { defaultView, viewTraceOptions } from '../core/render/view';
import constantsSource from './shaders/constants.wgsl';
import presentSource from './shaders/present.wgsl';
import { shadowTangentRadius } from '../core/physics/shadow';
import {
  flagsForView,
  overlayBits,
  overlayFlagsFor,
  packPresentParams,
  presentParamsDefinition,
  presentParamsLayout,
  splitColumnFor,
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
      peakTemperature: 124,
      flagsRight: 128,
      splitColumn: 132,
      overlayFlags: 136,
      padding: 140,
    };
    for (const field of traceParamsLayout.fields) {
      expect(field.offset, field.name).toBe(expected[field.name]);
    }
    expect(traceParamsLayout.fields).toHaveLength(Object.keys(expected).length);
    expect(traceParamsLayout.size).toBe(144);
  });

  it('keeps the flag bits identical in TypeScript and WGSL', () => {
    const constants = parseU32Constants(constantsSource);
    expect(constants['FLAG_LENSING']).toBe(traceFlags.lensing);
    expect(constants['FLAG_HIGHER_ORDER']).toBe(traceFlags.higherOrder);
    expect(constants['FLAG_DISK']).toBe(traceFlags.disk);
    expect(constants['FLAG_GRAVITATIONAL']).toBe(traceFlags.gravitational);
    expect(constants['FLAG_DOPPLER']).toBe(traceFlags.doppler);
  });

  it('keeps the overlay bits identical in TypeScript and WGSL', () => {
    const constants = parseU32Constants(constantsSource);
    expect(constants['OVERLAY_PHOTON_SPHERE']).toBe(overlayBits.photonSphere);
    expect(constants['OVERLAY_ISCO']).toBe(overlayBits.isco);
  });
});

describe('packTraceParams', () => {
  const buffer = packTraceParams(input);
  const view = new DataView(buffer);

  it('writes a buffer of exactly the struct size', () => {
    expect(buffer.byteLength).toBe(144);
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
    expect(view.getFloat32(offsetOf('observerDistance'), true)).toBe(defaultView.distance);
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
    expect(view.getFloat32(offsetOf('diskOuter'), true)).toBe(defaultView.diskOuterRadius);
    expect(view.getFloat32(offsetOf('escapeRadius'), true)).toBe(
      viewTraceOptions(defaultView).escapeRadius,
    );
    expect(view.getFloat32(offsetOf('peakTemperature'), true)).toBe(defaultView.peakTemperature);
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

describe('split and overlay parameters', () => {
  const read = (buffer: ArrayBuffer, name: string, kind: 'f' | 'u'): number => {
    const dataView = new DataView(buffer);
    return kind === 'f'
      ? dataView.getFloat32(offsetOf(name), true)
      : dataView.getUint32(offsetOf(name), true);
  };

  it('uses the same switches on both sides when the split is off', () => {
    const buffer = packTraceParams({
      ...input,
      view: { ...defaultView, doppler: false },
      split: { enabled: false, position: 0.5 },
    });
    expect(read(buffer, 'flags', 'u')).toBe(15 | 4 | 0);
    expect(read(buffer, 'flagsRight', 'u')).toBe(read(buffer, 'flags', 'u'));
    expect(read(buffer, 'splitColumn', 'f')).toBe(input.size.width + 1);
  });

  it('gives the right side of an active split the full model', () => {
    const buffer = packTraceParams({
      ...input,
      view: { ...defaultView, lensing: false, doppler: false },
      split: { enabled: true, position: 0.25 },
    });
    expect(read(buffer, 'flags', 'u') & traceFlags.lensing).toBe(0);
    expect(read(buffer, 'flagsRight', 'u')).toBe(31);
    expect(read(buffer, 'splitColumn', 'f')).toBe(50);
  });

  it('packs the overlay bits', () => {
    expect(overlayFlagsFor(undefined)).toBe(0);
    expect(overlayFlagsFor({ photonSphere: true, isco: false, shadowEdge: true })).toBe(1);
    expect(overlayFlagsFor({ photonSphere: false, isco: true, shadowEdge: false })).toBe(2);
    const buffer = packTraceParams({
      ...input,
      overlays: { photonSphere: true, isco: true, shadowEdge: false },
    });
    expect(read(buffer, 'overlayFlags', 'u')).toBe(3);
  });

  it('computes the split column in pixels', () => {
    expect(splitColumnFor({ enabled: true, position: 0.4 }, 100)).toBe(40);
    expect(splitColumnFor({ enabled: false, position: 0.4 }, 100)).toBe(101);
    expect(splitColumnFor(undefined, 100)).toBe(101);
  });
});

describe('present parameters', () => {
  const post = { exposure: 1.5, bloomStrength: 0.2, ditherAmplitude: 1 };
  const base = {
    post,
    view: defaultView,
    shadowEdge: true,
    split: { enabled: true, position: 0.3 },
    internal: { width: 100, height: 50 },
    target: { width: 200, height: 100 },
  };

  it('matches the struct declared in the WGSL source', () => {
    expect(parseStructDefinition(presentSource, 'PresentParams')).toEqual(presentParamsDefinition);
    expect(presentParamsLayout.size).toBe(48);
  });

  it('packs exposure, split, valid region and camera extents', () => {
    const buffer = packPresentParams(base);
    const data = new DataView(buffer);
    const at = (name: string): number => {
      const field = presentParamsLayout.fields.find((candidate) => candidate.name === name);
      return data.getFloat32(field?.offset ?? 0, true);
    };
    expect(at('exposure')).toBe(1.5);
    expect(at('bloomStrength')).toBeCloseTo(0.2, 6);
    expect(at('splitPosition')).toBeCloseTo(0.3, 6);
    expect(at('validU')).toBe(0.5);
    expect(at('validV')).toBe(0.5);
    expect(at('targetWidth')).toBe(200);
    expect(at('targetHeight')).toBe(100);
    expect(at('halfHeight')).toBeCloseTo(Math.tan(0.5 * defaultView.verticalFieldOfView), 6);
    expect(at('halfWidth')).toBeCloseTo(2 * at('halfHeight'), 6);
  });

  it('hides the divider and the shadow edge when they are off', () => {
    const buffer = packPresentParams({
      ...base,
      shadowEdge: false,
      split: { enabled: false, position: 0.3 },
    });
    const data = new DataView(buffer);
    const offset = (name: string): number =>
      presentParamsLayout.fields.find((candidate) => candidate.name === name)?.offset ?? 0;
    expect(data.getFloat32(offset('splitPosition'), true)).toBe(-1);
    expect(data.getFloat32(offset('shadowTangent'), true)).toBe(0);
  });

  it('sets the shadow tangent from the exact apparent radius', () => {
    const buffer = packPresentParams(base);
    const data = new DataView(buffer);
    const field = presentParamsLayout.fields.find(
      (candidate) => candidate.name === 'shadowTangent',
    );
    const expected = shadowTangentRadius(defaultView.distance);
    expect(data.getFloat32(field?.offset ?? 0, true)).toBeCloseTo(expected, 6);
  });
});
