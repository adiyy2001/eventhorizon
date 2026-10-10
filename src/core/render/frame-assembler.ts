import { type ViewportSize } from '../physics/observer';
import { computeGlow, type RgbImage } from './bloom';
import { channelsPerSample } from './cpu-frame';
import { encodeFrame } from './cpu-post';
import { type RenderSettings } from './settings';
import { type TileRequest, tileSamples } from './tile-scheduler';

export type DisplayQuality = 'preview' | 'final';

interface CachedGlow {
  version: number;
  image: RgbImage;
}

export class FrameAssembler {
  private readonly scene: Float32Array<ArrayBuffer>;
  private version = 0;
  private cachedGlow: CachedGlow | null = null;

  constructor(readonly size: ViewportSize) {
    this.scene = new Float32Array(size.width * size.height * channelsPerSample);
  }

  applyTile(tile: TileRequest, samples: Float32Array): void {
    const positions = tileSamples(tile);
    if (samples.length !== positions.length * channelsPerSample) {
      throw new RangeError('the sample buffer does not match the tile');
    }
    positions.forEach((position, index) => {
      const source = index * channelsPerSample;
      this.fillBlock(
        position.column,
        position.row,
        tile.step,
        samples[source] ?? 0,
        samples[source + 1] ?? 0,
        samples[source + 2] ?? 0,
      );
    });
    this.version += 1;
  }

  display(settings: RenderSettings, quality: DisplayQuality): Uint8ClampedArray<ArrayBuffer> {
    const final = quality === 'final';
    const glow = final && settings.bloomStrength > 0 ? this.glow() : null;
    return encodeFrame(this.scene, glow, settings, this.size, { dither: final });
  }

  private glow(): RgbImage {
    if (this.cachedGlow?.version !== this.version) {
      this.cachedGlow = { version: this.version, image: computeGlow(this.scene, this.size) };
    }
    return this.cachedGlow.image;
  }

  private fillBlock(
    column: number,
    row: number,
    step: number,
    red: number,
    green: number,
    blue: number,
  ): void {
    const lastRow = Math.min(row + step, this.size.height);
    const lastColumn = Math.min(column + step, this.size.width);
    for (let y = row; y < lastRow; y += 1) {
      for (let x = column; x < lastColumn; x += 1) {
        const offset = (y * this.size.width + x) * channelsPerSample;
        this.scene[offset] = red;
        this.scene[offset + 1] = green;
        this.scene[offset + 2] = blue;
      }
    }
  }
}
