import { defaultSettings, mergeSettings, type RenderSettings } from '../core/render/settings';
import { accumulationKey, convergedFrameCount } from './accumulation';
import { scaledSize } from './dynamic-resolution';
import { type FrameScheduler, type LoopRenderer, RenderLoop } from './render-loop';
import { type FrameInfo } from './renderer';
import { sceneHash } from '../core/render/settings';
import { type GpuMeasurement } from './gpu-timer';

class FakeClock implements FrameScheduler {
  private callback: ((time: number) => void) | null = null;
  private nextHandle = 1;
  now = 0;
  cancelled = 0;

  request(callback: (time: number) => void): number {
    this.callback = callback;
    return this.nextHandle++;
  }

  cancel(): void {
    this.cancelled += 1;
    this.callback = null;
  }

  get pending(): boolean {
    return this.callback !== null;
  }

  advance(milliseconds: number): boolean {
    const callback = this.callback;
    if (callback === null) {
      return false;
    }
    this.callback = null;
    this.now += milliseconds;
    callback(this.now);
    return true;
  }
}

class FakeRenderer implements LoopRenderer {
  accumulatedFrames = 0;
  framesInFlight = 0;
  gpuMeasurement: GpuMeasurement | null = null;
  readonly calls: { settings: RenderSettings; scale: number }[] = [];
  private key: number | null = null;

  constructor(
    private readonly costAtFullMs: number,
    private readonly withTiming: boolean,
  ) {}

  render(settings: RenderSettings, scale: number): FrameInfo {
    const internal = scaledSize({ width: 256, height: 256 }, scale);
    const key = accumulationKey(sceneHash(settings), internal.width, internal.height);
    const reset = key !== this.key;
    this.key = key;
    const frameIndex = reset ? 0 : this.accumulatedFrames;
    this.accumulatedFrames = frameIndex + 1;
    this.calls.push({ settings, scale });
    if (this.withTiming) {
      this.gpuMeasurement = { milliseconds: this.costAtFullMs * scale * scale, tag: scale };
    }
    return { frameIndex, reset, internal };
  }
}

function orbit(settings: RenderSettings, frame: number): RenderSettings {
  return mergeSettings(settings, { view: { azimuth: 0.01 * frame } });
}

describe('RenderLoop', () => {
  it('renders the first frame at full resolution and keeps accumulating', () => {
    const clock = new FakeClock();
    const renderer = new FakeRenderer(10, true);
    const loop = new RenderLoop(renderer, clock, defaultSettings);
    loop.start();
    for (let index = 0; index < 5; index += 1) {
      clock.advance(16.7);
    }
    expect(renderer.calls).toHaveLength(5);
    expect(renderer.calls.every((call) => call.scale === 1)).toBe(true);
    expect(renderer.accumulatedFrames).toBe(5);
    expect(loop.running).toBe(true);
  });

  it('stops scheduling once the image has converged and wakes up on a change', () => {
    const clock = new FakeClock();
    const renderer = new FakeRenderer(10, true);
    const loop = new RenderLoop(renderer, clock, defaultSettings);
    loop.start();
    let guard = 0;
    while (clock.advance(16.7) && guard < convergedFrameCount + 20) {
      guard += 1;
    }
    expect(renderer.accumulatedFrames).toBe(convergedFrameCount);
    expect(loop.running).toBe(false);
    expect(clock.pending).toBe(false);
    loop.setSettings(mergeSettings(defaultSettings, { exposure: 1 }));
    expect(clock.pending).toBe(true);
    clock.advance(16.7);
    expect(renderer.calls[renderer.calls.length - 1]?.settings.exposure).toBe(1);
  });

  it('drops the resolution while the camera moves and restores it at rest', () => {
    const clock = new FakeClock();
    const renderer = new FakeRenderer(80, true);
    const loop = new RenderLoop(renderer, clock, defaultSettings);
    loop.start();
    for (let index = 0; index < 4; index += 1) {
      clock.advance(16.7);
    }
    for (let frame = 1; frame <= 60; frame += 1) {
      loop.setSettings(orbit(defaultSettings, frame));
      clock.advance(Math.max(16.7, 80 * loop.scale * loop.scale));
    }
    const movingScales = loop.log.filter((entry) => entry.moving).map((entry) => entry.scale);
    expect(Math.min(...movingScales)).toBeLessThan(0.6);
    for (let index = 0; index < 8; index += 1) {
      clock.advance(16.7);
    }
    const last = loop.log[loop.log.length - 1];
    expect(last?.moving).toBe(false);
    expect(last?.scale).toBe(1);
    expect(renderer.accumulatedFrames).toBeGreaterThan(3);
  });

  it('resets accumulation whenever the scene changes', () => {
    const clock = new FakeClock();
    const renderer = new FakeRenderer(5, true);
    const loop = new RenderLoop(renderer, clock, defaultSettings);
    loop.start();
    for (let index = 0; index < 10; index += 1) {
      clock.advance(16.7);
    }
    expect(renderer.accumulatedFrames).toBe(10);
    loop.setSettings(mergeSettings(defaultSettings, { view: { doppler: false } }));
    clock.advance(16.7);
    expect(renderer.accumulatedFrames).toBe(1);
  });

  it('does not reset accumulation for a post-only change', () => {
    const clock = new FakeClock();
    const renderer = new FakeRenderer(5, true);
    const loop = new RenderLoop(renderer, clock, defaultSettings);
    loop.start();
    for (let index = 0; index < 10; index += 1) {
      clock.advance(16.7);
    }
    loop.setSettings(mergeSettings(defaultSettings, { exposure: 2, bloomStrength: 0.2 }));
    clock.advance(16.7);
    expect(renderer.accumulatedFrames).toBe(11);
  });

  it('works from frame deltas alone when no timing is available', () => {
    const clock = new FakeClock();
    const renderer = new FakeRenderer(80, false);
    const loop = new RenderLoop(renderer, clock, defaultSettings);
    loop.start();
    for (let index = 0; index < 4; index += 1) {
      clock.advance(16.7);
    }
    for (let frame = 1; frame <= 80; frame += 1) {
      loop.setSettings(orbit(defaultSettings, frame));
      clock.advance(Math.max(16.7, 80 * loop.scale * loop.scale));
    }
    expect(loop.scale).toBeLessThan(0.7);
    expect(loop.scale).toBeGreaterThanOrEqual(0.35);
  });

  it('keeps a bounded log and reports every frame to the callback', () => {
    const clock = new FakeClock();
    const renderer = new FakeRenderer(5, true);
    const seen: number[] = [];
    const loop = new RenderLoop(renderer, clock, defaultSettings, {
      maxLogEntries: 10,
      onFrame: (info) => {
        seen.push(info.frameIndex);
      },
    });
    loop.start();
    for (let index = 0; index < 25; index += 1) {
      clock.advance(16.7);
    }
    expect(loop.log).toHaveLength(10);
    expect(seen).toHaveLength(25);
    expect(loop.log[9]?.frame).toBe(24);
  });

  it('stops cleanly and can start again', () => {
    const clock = new FakeClock();
    const renderer = new FakeRenderer(5, true);
    const loop = new RenderLoop(renderer, clock, defaultSettings);
    loop.start();
    clock.advance(16.7);
    loop.stop();
    expect(loop.running).toBe(false);
    expect(clock.cancelled).toBe(1);
    expect(clock.advance(16.7)).toBe(false);
    loop.start();
    expect(loop.running).toBe(true);
    loop.stop();
    loop.stop();
    expect(clock.cancelled).toBe(2);
  });

  it('waits while the GPU has too many frames queued', () => {
    const clock = new FakeClock();
    const renderer = new FakeRenderer(5, true);
    const loop = new RenderLoop(renderer, clock, defaultSettings, { maxFramesInFlight: 2 });
    loop.start();
    clock.advance(16.7);
    expect(renderer.calls).toHaveLength(1);
    renderer.framesInFlight = 2;
    clock.advance(16.7);
    clock.advance(16.7);
    expect(renderer.calls).toHaveLength(1);
    expect(loop.running).toBe(true);
    renderer.framesInFlight = 1;
    clock.advance(16.7);
    expect(renderer.calls).toHaveLength(2);
  });

  it('idles after the configured number of frames', () => {
    const clock = new FakeClock();
    const renderer = new FakeRenderer(5, true);
    const loop = new RenderLoop(renderer, clock, defaultSettings, { idleAfterFrames: 4 });
    loop.start();
    while (clock.advance(16.7)) {
      if (renderer.calls.length > 50) {
        break;
      }
    }
    expect(renderer.calls).toHaveLength(4);
    expect(loop.running).toBe(false);
  });

  it('exposes the current settings', () => {
    const clock = new FakeClock();
    const loop = new RenderLoop(new FakeRenderer(5, true), clock, defaultSettings);
    const next = mergeSettings(defaultSettings, { exposure: 1 });
    loop.setSettings(next);
    expect(loop.currentSettings).toBe(next);
  });
});
