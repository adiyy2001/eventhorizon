import { channelsPerSample, createCpuShader, renderCpuScene } from './cpu-frame';
import { renderCpuImage } from './cpu-image';
import { renderTileSamples } from './cpu-tile';
import { FrameAssembler } from './frame-assembler';
import { defaultSettings, mergeSettings } from './settings';
import { planPasses, tilesForPass, tileSamples } from './tile-scheduler';

describe('renderTileSamples', () => {
  const size = { width: 40, height: 24 };

  it('returns the radiance of every new sample of the tile in order', () => {
    const shader = createCpuShader(defaultSettings, size);
    const scene = renderCpuScene(defaultSettings, size);
    const pass = planPasses(size)[1];
    if (pass === undefined) {
      throw new Error('no second pass');
    }
    const tile = tilesForPass(size, pass)[0];
    if (tile === undefined) {
      throw new Error('no tile');
    }
    const positions = tileSamples(tile);
    const samples = renderTileSamples(shader, tile);
    expect(samples).toHaveLength(positions.length * channelsPerSample);
    positions.forEach((position, index) => {
      const sceneOffset = (position.row * size.width + position.column) * channelsPerSample;
      expect([...samples.subarray(index * 3, index * 3 + 3)]).toEqual([
        ...scene.subarray(sceneOffset, sceneOffset + 3),
      ]);
    });
  });
});

describe('progressive rendering', () => {
  it.each([
    { width: 20, height: 12 },
    { width: 16, height: 16 },
    { width: 37, height: 21 },
  ])('ends with the image of a direct render for $width by $height', (size) => {
    const settings = mergeSettings(defaultSettings, {
      overlays: { shadowEdge: true },
      split: { enabled: true, position: 0.4 },
    });
    const shader = createCpuShader(settings, size);
    const assembler = new FrameAssembler(size);
    for (const pass of planPasses(size)) {
      for (const tile of tilesForPass(size, pass)) {
        assembler.applyTile(tile, renderTileSamples(shader, tile));
      }
    }
    expect(assembler.display(settings, 'final')).toEqual(renderCpuImage(settings, size));
  });

  it('does not depend on the order in which the tiles of a pass arrive', () => {
    const size = { width: 48, height: 48 };
    const shader = createCpuShader(defaultSettings, size);
    const forward = new FrameAssembler(size);
    const backward = new FrameAssembler(size);
    for (const pass of planPasses(size)) {
      const tiles = tilesForPass(size, pass);
      tiles.forEach((tile) => {
        forward.applyTile(tile, renderTileSamples(shader, tile));
      });
      [...tiles].reverse().forEach((tile) => {
        backward.applyTile(tile, renderTileSamples(shader, tile));
      });
    }
    expect(backward.display(defaultSettings, 'final')).toEqual(
      forward.display(defaultSettings, 'final'),
    );
  });

  it('shows a complete coarse image of uniform blocks after the first pass', () => {
    const size = { width: 32, height: 32 };
    const shader = createCpuShader(defaultSettings, size);
    const assembler = new FrameAssembler(size);
    const first = planPasses(size)[0];
    if (first === undefined) {
      throw new Error('no pass');
    }
    for (const tile of tilesForPass(size, first)) {
      assembler.applyTile(tile, renderTileSamples(shader, tile));
    }
    const pixels = assembler.display(defaultSettings, 'preview');
    const blockColors = new Set<string>();
    for (let blockRow = 0; blockRow < 4; blockRow += 1) {
      for (let blockColumn = 0; blockColumn < 4; blockColumn += 1) {
        const colors = new Set<string>();
        for (let y = blockRow * 8; y < blockRow * 8 + 8; y += 1) {
          for (let x = blockColumn * 8; x < blockColumn * 8 + 8; x += 1) {
            colors.add(String(pixels.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)));
          }
        }
        expect(colors.size).toBe(1);
        colors.forEach((color) => blockColors.add(color));
      }
    }
    expect(blockColors.size).toBeGreaterThan(1);
  });
});
