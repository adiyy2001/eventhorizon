import {
  isNewSample,
  maxWorkers,
  planPasses,
  poolSize,
  RenderJob,
  tileSamples,
  tilesForPass,
  tileSampleEdge,
} from './tile-scheduler';

describe('planPasses', () => {
  it('goes from one eighth to full resolution', () => {
    expect(planPasses({ width: 512, height: 512 }).map((pass) => pass.step)).toEqual([8, 4, 2, 1]);
  });

  it('drops steps larger than the image', () => {
    expect(planPasses({ width: 6, height: 3 }).map((pass) => pass.step)).toEqual([4, 2, 1]);
    expect(planPasses({ width: 1, height: 1 }).map((pass) => pass.step)).toEqual([1]);
  });

  it('numbers the passes from zero', () => {
    expect(planPasses({ width: 64, height: 64 }).map((pass) => pass.index)).toEqual([0, 1, 2, 3]);
  });
});

describe('isNewSample', () => {
  it('takes every grid sample in the first pass', () => {
    expect(isNewSample(8, 8, { index: 0, step: 8 })).toBe(true);
  });

  it('skips samples that the coarser pass already computed', () => {
    expect(isNewSample(8, 8, { index: 1, step: 4 })).toBe(false);
    expect(isNewSample(4, 8, { index: 1, step: 4 })).toBe(true);
    expect(isNewSample(4, 4, { index: 1, step: 4 })).toBe(true);
  });
});

describe('tilesForPass', () => {
  const size = { width: 100, height: 40 };

  it('covers the image without overlap and clips the last tiles', () => {
    const tiles = tilesForPass(size, { index: 3, step: 1 });
    let area = 0;
    for (const tile of tiles) {
      expect(tile.column + tile.columns).toBeLessThanOrEqual(size.width);
      expect(tile.row + tile.rows).toBeLessThanOrEqual(size.height);
      area += tile.columns * tile.rows;
    }
    expect(area).toBe(size.width * size.height);
  });

  it('sizes tiles by the number of samples, not by pixels', () => {
    const tile = tilesForPass({ width: 512, height: 512 }, { index: 0, step: 8 })[0];
    expect(tile?.columns).toBe(tileSampleEdge * 8);
  });

  it('starts with the tile closest to the centre', () => {
    const tiles = tilesForPass({ width: 64, height: 64 }, { index: 3, step: 1 });
    const first = tiles[0];
    const last = tiles.at(-1);
    expect(first?.column).toBeGreaterThanOrEqual(16);
    expect(first?.column).toBeLessThan(48);
    expect(last?.column === 0 || last?.column === 48).toBe(true);
  });
});

describe('tileSamples', () => {
  it('visits each pixel as a sample exactly once over all passes', () => {
    const size = { width: 37, height: 21 };
    const seen = new Map<string, number>();
    for (const pass of planPasses(size)) {
      for (const tile of tilesForPass(size, pass)) {
        for (const sample of tileSamples(tile)) {
          const key = `${String(sample.column)},${String(sample.row)}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
      }
    }
    expect(seen.size).toBe(size.width * size.height);
    expect([...seen.values()].every((count) => count === 1)).toBe(true);
  });

  it('computes one eighth of the work in the first pass of a large image', () => {
    const size = { width: 512, height: 512 };
    const first = planPasses(size)[0];
    const total = first === undefined ? 0 : tilesForPass(size, first).flatMap(tileSamples).length;
    expect(total).toBe(64 * 64);
  });
});

describe('RenderJob', () => {
  it('hands out every tile once and then nothing', () => {
    const job = new RenderJob(1, { width: 64, height: 64 });
    const handed = [];
    for (let tile = job.nextTile(); tile !== null; tile = job.nextTile()) {
      handed.push(tile);
    }
    expect(handed.length).toBe(job.progress().tilesTotal);
    expect(job.nextTile()).toBeNull();
  });

  it('serves the coarse pass before the finer ones', () => {
    const job = new RenderJob(1, { width: 64, height: 64 });
    const passes = [];
    for (let tile = job.nextTile(); tile !== null; tile = job.nextTile()) {
      passes.push(tile.pass);
    }
    expect(passes).toEqual([...passes].sort((first, second) => first - second));
  });

  it('reports finished passes and completion', () => {
    const job = new RenderJob(7, { width: 32, height: 32 });
    expect(job.progress()).toMatchObject({ generation: 7, passesDone: 0, complete: false });
    for (let tile = job.nextTile(); tile !== null; tile = job.nextTile()) {
      job.tileFinished(tile);
    }
    expect(job.progress()).toMatchObject({
      passesDone: job.progress().passesTotal,
      tilesDone: job.progress().tilesTotal,
      complete: true,
    });
  });

  it('counts a pass as done only when all of its tiles are done', () => {
    const job = new RenderJob(1, { width: 256, height: 256 });
    const first = job.nextTile();
    if (first === null) {
      throw new Error('no tile');
    }
    job.tileFinished(first);
    expect(job.progress().passesDone).toBe(0);
    expect(job.progress().tilesDone).toBe(1);
    expect(job.passComplete(0)).toBe(false);
  });

  it('completes the first pass before any later pass', () => {
    const job = new RenderJob(1, { width: 64, height: 64 });
    const firstPassTiles = [];
    for (let tile = job.nextTile(); tile?.pass === 0; tile = job.nextTile()) {
      firstPassTiles.push(tile);
    }
    expect(job.passComplete(0)).toBe(false);
    firstPassTiles.forEach((tile) => {
      job.tileFinished(tile);
    });
    expect(job.passComplete(0)).toBe(true);
    expect(job.passComplete(1)).toBe(false);
  });

  it('knows no pass beyond the planned ones', () => {
    expect(new RenderJob(1, { width: 8, height: 8 }).passComplete(9)).toBe(false);
  });
});

describe('poolSize', () => {
  it('leaves one core to the page', () => {
    expect(poolSize(4)).toBe(3);
    expect(poolSize(8)).toBe(7);
  });

  it('never goes below one worker', () => {
    expect(poolSize(1)).toBe(1);
    expect(poolSize(2)).toBe(1);
    expect(poolSize(0)).toBe(1);
  });

  it('stops at the largest pool', () => {
    expect(maxWorkers).toBe(8);
    expect(poolSize(9)).toBe(8);
    expect(poolSize(64)).toBe(8);
  });

  it('rounds fractional core counts down and survives a missing value', () => {
    expect(poolSize(6.9)).toBe(5);
    expect(poolSize(Number.NaN)).toBe(1);
    expect(poolSize(Infinity)).toBe(1);
  });
});
