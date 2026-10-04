import { defaultSettings, type RenderSettings } from '../core/render/settings';
import { sceneHash } from '../core/render/settings';
import { accumulationKey } from './accumulation';
import { scaledSize } from './dynamic-resolution';
import { type GpuMeasurement } from './gpu-timer';
import { runMotionPlan } from './motion-run';
import { type FrameScheduler, type LoopRenderer } from './render-loop';
import { type FrameInfo } from './renderer';

class Clock implements FrameScheduler {
  private queued: ((time: number) => void) | null = null;
  private time = 0;
  private handle = 0;

  request(callback: (time: number) => void): number {
    this.queued = callback;
    this.handle += 1;
    queueMicrotask(() => {
      const next = this.queued;
      this.queued = null;
      this.time += 16.7;
      next?.(this.time);
    });
    return this.handle;
  }

  cancel(): void {
    this.queued = null;
  }
}

class Renderer implements LoopRenderer {
  accumulatedFrames = 0;
  framesInFlight = 0;
  gpuMeasurement: GpuMeasurement | null = null;
  private key: number | null = null;

  render(settings: RenderSettings, scale: number): FrameInfo {
    const internal = scaledSize({ width: 128, height: 128 }, scale);
    const key = accumulationKey(sceneHash(settings), internal.width, internal.height);
    const reset = key !== this.key;
    this.key = key;
    this.accumulatedFrames = reset ? 1 : this.accumulatedFrames + 1;
    this.gpuMeasurement = { milliseconds: 90 * scale * scale, tag: scale };
    return { frameIndex: this.accumulatedFrames - 1, reset, internal };
  }
}

describe('runMotionPlan', () => {
  it('moves the camera and lets it rest, logging a drop and a recovery', async () => {
    const log = await runMotionPlan(new Renderer(), new Clock(), defaultSettings, {
      restFrames: 3,
      moveFrames: 30,
      settleFrames: 8,
      azimuthStep: 0.02,
    });
    expect(log).toHaveLength(41);
    expect(log[0]?.scale).toBe(1);
    const moving = log.filter((entry) => entry.moving);
    expect(Math.min(...moving.map((entry) => entry.scale))).toBeLessThan(0.7);
    const last = log[log.length - 1];
    expect(last?.moving).toBe(false);
    expect(last?.scale).toBe(1);
  });
});
