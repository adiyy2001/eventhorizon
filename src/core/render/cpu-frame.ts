import { buildTemperatureLut, type TemperatureLut } from '../color/temperature-lut';
import {
  type CameraBasis,
  pixelDirection,
  staticObserverRay,
  type ViewportSize,
} from '../physics/observer';
import { traceRay, type TraceOptions } from '../physics/trace';
import { fullModelView, type RenderSettings } from './settings';
import { traceRadiance } from './shade';
import { type ViewDescription, viewBasis, viewTraceOptions } from './view';

export const channelsPerSample = 3;

export interface CpuShader {
  writeRadiance: (column: number, row: number, target: Float32Array, offset: number) => void;
}

interface ViewContext {
  view: ViewDescription;
  basis: CameraBasis;
  options: TraceOptions;
}

let sharedLut: TemperatureLut | null = null;

export function sharedTemperatureLut(): TemperatureLut {
  sharedLut ??= buildTemperatureLut();
  return sharedLut;
}

function contextFor(view: ViewDescription): ViewContext {
  return { view, basis: viewBasis(view), options: viewTraceOptions(view) };
}

export function createCpuShader(
  settings: RenderSettings,
  size: ViewportSize,
  lut: TemperatureLut = sharedTemperatureLut(),
): CpuShader {
  const left = contextFor(settings.view);
  const right = settings.split.enabled ? contextFor(fullModelView(settings.view)) : left;
  const splitColumn = settings.split.enabled ? settings.split.position * size.width : Infinity;

  return {
    writeRadiance: (column, row, target, offset) => {
      const context = column + 0.5 < splitColumn ? left : right;
      const direction = pixelDirection(
        context.basis,
        context.view.verticalFieldOfView,
        size,
        column + 0.5,
        row + 0.5,
      );
      const result = traceRay(
        staticObserverRay(context.basis.position, direction),
        context.options,
      );
      target.set(traceRadiance(result, context.view, lut), offset);
    },
  };
}

export function renderCpuScene(
  settings: RenderSettings,
  size: ViewportSize,
): Float32Array<ArrayBuffer> {
  const shader = createCpuShader(settings, size);
  const scene = new Float32Array(size.width * size.height * channelsPerSample);
  for (let row = 0; row < size.height; row += 1) {
    for (let column = 0; column < size.width; column += 1) {
      shader.writeRadiance(column, row, scene, (row * size.width + column) * channelsPerSample);
    }
  }
  return scene;
}

export function cpuRenderKey(settings: RenderSettings, size: ViewportSize): string {
  const split = settings.split.enabled ? settings.split.position : null;
  return JSON.stringify([settings.view, split, size.width, size.height]);
}
