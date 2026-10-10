import { type ViewportSize } from '../core/physics/observer';
import {
  cpuRenderKey,
  createCpuShader,
  type CpuShader,
  sharedTemperatureLut,
} from '../core/render/cpu-frame';
import { renderTileSamples } from '../core/render/cpu-tile';
import { type RenderSettings } from '../core/render/settings';
import { parseWorkerRequest, type WorkerRequest, type WorkerResponse } from './protocol';

interface CachedShader {
  key: string;
  shader: CpuShader;
}

export type Clock = () => number;

export type ShaderFactory = (settings: RenderSettings, size: ViewportSize) => CpuShader;

export class TileHandler {
  private cached: CachedShader | null = null;

  constructor(
    private readonly now: Clock,
    private readonly createShader: ShaderFactory = createCpuShader,
  ) {}

  warmUp(): void {
    sharedTemperatureLut();
  }

  receive(data: unknown): WorkerResponse {
    const request = parseWorkerRequest(data);
    if (request === null) {
      return { type: 'request-rejected', detail: 'the message is not a valid render request' };
    }
    return this.handle(request);
  }

  handle(request: WorkerRequest): WorkerResponse {
    const started = this.now();
    try {
      const shader = this.shaderFor(request.settings, request.size);
      const samples = renderTileSamples(shader, request.tile);
      return {
        type: 'tile-done',
        generation: request.generation,
        tile: request.tile,
        samples,
        milliseconds: this.now() - started,
      };
    } catch (error) {
      return {
        type: 'tile-failed',
        generation: request.generation,
        tile: request.tile,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private shaderFor(settings: RenderSettings, size: ViewportSize): CpuShader {
    const key = cpuRenderKey(settings, size);
    if (this.cached?.key === key) {
      return this.cached.shader;
    }
    const shader = this.createShader(settings, size);
    this.cached = { key, shader };
    return shader;
  }
}
