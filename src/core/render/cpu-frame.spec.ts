import { channelsPerSample, cpuRenderKey, createCpuShader, renderCpuScene } from './cpu-frame';
import { renderReferenceImage } from './reference-image';
import { defaultSettings, fullModelView, mergeSettings } from './settings';

const size = { width: 16, height: 16 };

function pixelOf(scene: Float32Array, column: number, row: number, width = size.width): number[] {
  const offset = (row * width + column) * channelsPerSample;
  return [...scene.subarray(offset, offset + channelsPerSample)];
}

describe('renderCpuScene', () => {
  it('holds the radiance of the reference tracer for every pixel', () => {
    const reference = renderReferenceImage(defaultSettings.view, size);
    expect(renderCpuScene(defaultSettings, size)).toEqual(reference.radiance);
  });

  it('is black in the shadow and lit somewhere else', () => {
    const wide = { width: 32, height: 32 };
    const scene = renderCpuScene(defaultSettings, wide);
    expect(pixelOf(scene, 16, 16, 32)).toEqual([0, 0, 0]);
    const lit = Array.from({ length: wide.width }, (_, column) =>
      pixelOf(scene, column, 5, wide.width),
    ).some((pixel) => pixel.some((channel) => channel > 0));
    expect(lit).toBe(true);
  });

  it('is deterministic', () => {
    expect(renderCpuScene(defaultSettings, size)).toEqual(renderCpuScene(defaultSettings, size));
  });
});

describe('split compare', () => {
  const doppler = mergeSettings(defaultSettings, { view: { doppler: false } });
  const split = mergeSettings(doppler, { split: { enabled: true, position: 0.5 } });
  const wide = { width: 24, height: 16 };
  const leftOnly = renderCpuScene(doppler, wide);
  const fullOnly = renderCpuScene({ ...doppler, view: fullModelView(doppler.view) }, wide);
  const splitScene = renderCpuScene(split, wide);

  it('traces the selected effects on the left and the full model on the right', () => {
    for (let row = 0; row < wide.height; row += 1) {
      expect(pixelOf(splitScene, 2, row, wide.width)).toEqual(
        pixelOf(leftOnly, 2, row, wide.width),
      );
      expect(pixelOf(splitScene, 21, row, wide.width)).toEqual(
        pixelOf(fullOnly, 21, row, wide.width),
      );
    }
  });

  it('shows a visible difference between the two sides in this setup', () => {
    const rightHalf = Array.from({ length: wide.width / 2 }, (_, index) => wide.width / 2 + index);
    const differing = rightHalf.filter((column) =>
      Array.from({ length: wide.height }, (_, row) => row).some(
        (row) =>
          pixelOf(leftOnly, column, row, wide.width).join() !==
          pixelOf(fullOnly, column, row, wide.width).join(),
      ),
    );
    expect(differing.length).toBeGreaterThan(2);
  });

  it('switches sides at the pixel whose centre passes the split column', () => {
    const odd = mergeSettings(doppler, { split: { enabled: true, position: 0.51 } });
    const oddScene = renderCpuScene(odd, wide);
    const boundary = Math.floor(0.51 * wide.width);
    for (let row = 0; row < wide.height; row += 1) {
      expect(pixelOf(oddScene, boundary - 1, row, wide.width)).toEqual(
        pixelOf(leftOnly, boundary - 1, row, wide.width),
      );
      expect(pixelOf(oddScene, boundary + 1, row, wide.width)).toEqual(
        pixelOf(fullOnly, boundary + 1, row, wide.width),
      );
    }
  });
});

describe('createCpuShader', () => {
  it('writes the radiance of one pixel at the requested offset', () => {
    const shader = createCpuShader(defaultSettings, size);
    const target = new Float32Array(6).fill(-1);
    shader.writeRadiance(5, 9, target, 3);
    expect([...target.subarray(0, 3)]).toEqual([-1, -1, -1]);
    expect([...target.subarray(3)]).toEqual(pixelOf(renderCpuScene(defaultSettings, size), 5, 9));
  });
});

describe('cpuRenderKey', () => {
  it('ignores what the main thread applies after tracing', () => {
    const base = cpuRenderKey(defaultSettings, size);
    const marked = mergeSettings(defaultSettings, {
      overlays: { shadowEdge: true, photonSphere: true, isco: true },
    });
    expect(cpuRenderKey(marked, size)).toBe(base);
    expect(cpuRenderKey(mergeSettings(defaultSettings, { exposure: 2 }), size)).toBe(base);
    expect(cpuRenderKey(mergeSettings(defaultSettings, { bloomStrength: 0.4 }), size)).toBe(base);
  });

  it('changes with the view, the split and the size', () => {
    const base = cpuRenderKey(defaultSettings, size);
    expect(cpuRenderKey(mergeSettings(defaultSettings, { view: { distance: 40 } }), size)).not.toBe(
      base,
    );
    expect(
      cpuRenderKey(mergeSettings(defaultSettings, { view: { doppler: false } }), size),
    ).not.toBe(base);
    expect(
      cpuRenderKey(mergeSettings(defaultSettings, { split: { enabled: true } }), size),
    ).not.toBe(base);
    expect(cpuRenderKey(defaultSettings, { width: 8, height: 8 })).not.toBe(base);
  });

  it('follows the split position only while the split is on', () => {
    const base = cpuRenderKey(defaultSettings, size);
    expect(cpuRenderKey(mergeSettings(defaultSettings, { split: { position: 0.3 } }), size)).toBe(
      base,
    );
    const on = mergeSettings(defaultSettings, { split: { enabled: true, position: 0.3 } });
    const moved = mergeSettings(defaultSettings, { split: { enabled: true, position: 0.6 } });
    expect(cpuRenderKey(on, size)).not.toBe(cpuRenderKey(moved, size));
  });
});
