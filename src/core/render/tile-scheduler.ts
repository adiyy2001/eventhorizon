import { type ViewportSize } from '../physics/observer';

export const passSteps: readonly number[] = [8, 4, 2, 1];
export const tileSampleEdge = 16;
export const maxWorkers = 8;
const fallbackCoreCount = 2;

export function poolSize(hardwareConcurrency: number): number {
  const cores = Number.isFinite(hardwareConcurrency)
    ? Math.floor(hardwareConcurrency)
    : fallbackCoreCount;
  return Math.min(maxWorkers, Math.max(1, cores - 1));
}

export interface RenderPass {
  index: number;
  step: number;
}

export interface TileRequest {
  pass: number;
  step: number;
  column: number;
  row: number;
  columns: number;
  rows: number;
}

export interface SamplePosition {
  column: number;
  row: number;
}

export function planPasses(size: ViewportSize): RenderPass[] {
  const longest = Math.max(size.width, size.height);
  const steps = passSteps.filter((step) => step <= longest);
  return steps.map((step, index) => ({ index, step }));
}

function isCoarserSample(column: number, row: number, step: number): boolean {
  const coarser = step * 2;
  return column % coarser === 0 && row % coarser === 0;
}

export function isNewSample(column: number, row: number, pass: RenderPass): boolean {
  if (pass.index === 0) {
    return true;
  }
  return !isCoarserSample(column, row, pass.step);
}

export function tilesForPass(size: ViewportSize, pass: RenderPass): TileRequest[] {
  const edge = tileSampleEdge * pass.step;
  const tiles: TileRequest[] = [];
  for (let row = 0; row < size.height; row += edge) {
    for (let column = 0; column < size.width; column += edge) {
      tiles.push({
        pass: pass.index,
        step: pass.step,
        column,
        row,
        columns: Math.min(edge, size.width - column),
        rows: Math.min(edge, size.height - row),
      });
    }
  }
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const distanceToCenter = (tile: TileRequest): number =>
    Math.hypot(tile.column + tile.columns / 2 - centerX, tile.row + tile.rows / 2 - centerY);
  return tiles.sort((first, second) => distanceToCenter(first) - distanceToCenter(second));
}

export function tileSamples(tile: TileRequest): SamplePosition[] {
  const samples: SamplePosition[] = [];
  const pass: RenderPass = { index: tile.pass, step: tile.step };
  for (let row = tile.row; row < tile.row + tile.rows; row += tile.step) {
    for (let column = tile.column; column < tile.column + tile.columns; column += tile.step) {
      if (isNewSample(column, row, pass)) {
        samples.push({ column, row });
      }
    }
  }
  return samples;
}

export interface JobProgress {
  generation: number;
  passesTotal: number;
  passesDone: number;
  tilesTotal: number;
  tilesDone: number;
  complete: boolean;
}

export class RenderJob {
  private readonly passes: RenderPass[];
  private readonly tilesByPass: TileRequest[][];
  private passCursor = 0;
  private tileCursor = 0;
  private readonly doneByPass: number[];

  constructor(
    readonly generation: number,
    readonly size: ViewportSize,
  ) {
    this.passes = planPasses(size);
    this.tilesByPass = this.passes.map((pass) => tilesForPass(size, pass));
    this.doneByPass = this.passes.map(() => 0);
  }

  nextTile(): TileRequest | null {
    while (this.passCursor < this.tilesByPass.length) {
      const tiles = this.tilesByPass[this.passCursor] ?? [];
      const tile = tiles[this.tileCursor];
      if (tile !== undefined) {
        this.tileCursor += 1;
        return tile;
      }
      this.passCursor += 1;
      this.tileCursor = 0;
    }
    return null;
  }

  tileFinished(tile: TileRequest): void {
    this.doneByPass[tile.pass] = (this.doneByPass[tile.pass] ?? 0) + 1;
  }

  passComplete(index: number): boolean {
    return (this.doneByPass[index] ?? 0) === this.tilesByPass[index]?.length;
  }

  progress(): JobProgress {
    const passesDone = this.tilesByPass.filter((_, index) => this.passComplete(index)).length;
    const tilesTotal = this.tilesByPass.reduce((total, tiles) => total + tiles.length, 0);
    const tilesDone = this.doneByPass.reduce((total, done) => total + done, 0);
    return {
      generation: this.generation,
      passesTotal: this.passes.length,
      passesDone,
      tilesTotal,
      tilesDone,
      complete: tilesDone === tilesTotal,
    };
  }
}
