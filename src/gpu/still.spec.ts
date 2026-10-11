import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportLimits } from '../core/render/export';
import { defaultSettings } from '../core/render/settings';
import { type CapturedImage, Renderer } from './renderer';
import { type SkyResources } from './sky-resources';
import { renderStill } from './still';

const device = {} as GPUDevice;
const sky = {} as SkyResources;
const fallback = { width: 512, height: 512 };
const image: CapturedImage = { width: 2, height: 2, rgba: new Uint8Array(16) };

function fakeRenderer(failure?: Error) {
  return {
    renderFrames: vi.fn(async () => {
      await Promise.resolve();
      if (failure !== undefined) {
        throw failure;
      }
    }),
    capture: vi.fn(async () => {
      await Promise.resolve();
      return image;
    }),
    destroy: vi.fn(),
  };
}

function useRenderer(renderer: ReturnType<typeof fakeRenderer>) {
  return vi.spyOn(Renderer, 'create').mockResolvedValue(renderer as unknown as Renderer);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('renderStill', () => {
  it('renders the requested frames at the requested size and captures the result', async () => {
    const renderer = fakeRenderer();
    const create = useRenderer(renderer);
    const result = await renderStill(
      device,
      sky,
      { settings: defaultSettings, size: { width: 800, height: 600 }, frames: 8 },
      fallback,
    );
    expect(result).toBe(image);
    expect(create).toHaveBeenCalledWith(device, { width: 800, height: 600 }, null, sky);
    expect(renderer.renderFrames).toHaveBeenCalledWith(defaultSettings, 8);
    expect(renderer.capture).toHaveBeenCalledWith(defaultSettings);
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
  });

  it('clamps the size and the frame count to the export limits', async () => {
    const renderer = fakeRenderer();
    const create = useRenderer(renderer);
    await renderStill(
      device,
      sky,
      {
        settings: defaultSettings,
        size: { width: 100_000, height: 1 },
        frames: exportLimits.maxFrames * 10,
      },
      fallback,
    );
    expect(create).toHaveBeenCalledWith(
      device,
      { width: exportLimits.maxEdge, height: exportLimits.minEdge },
      null,
      sky,
    );
    expect(renderer.renderFrames).toHaveBeenCalledWith(defaultSettings, exportLimits.maxFrames);
  });

  it('uses the default frame count when none is given', async () => {
    const renderer = fakeRenderer();
    useRenderer(renderer);
    await renderStill(
      device,
      sky,
      { settings: defaultSettings, size: { width: 256, height: 256 } },
      fallback,
    );
    expect(renderer.renderFrames).toHaveBeenCalledWith(defaultSettings, exportLimits.defaultFrames);
  });

  it('destroys the renderer when rendering fails', async () => {
    const renderer = fakeRenderer(new Error('device lost'));
    useRenderer(renderer);
    await expect(
      renderStill(
        device,
        sky,
        { settings: defaultSettings, size: { width: 256, height: 256 } },
        fallback,
      ),
    ).rejects.toThrow('device lost');
    expect(renderer.capture).not.toHaveBeenCalled();
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
  });
});
