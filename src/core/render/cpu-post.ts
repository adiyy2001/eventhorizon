import { hash3, unitFloat } from '../background/hash';
import { displayEncodeInto, exposureScale } from '../color/tonemap';
import { type MutableRgb } from '../color/xyz-srgb';
import { type ViewportSize } from '../physics/observer';
import { type RgbImage, sampleImage } from './bloom';
import { channelsPerSample } from './cpu-frame';
import { createOverlayPainter } from './cpu-overlays';
import { defaultPost } from './post';
import { type RenderSettings } from './settings';

const colorLevels = 255;
const ditherSeedFirst = 101;
const ditherSeedSecond = 202;
const outputChannels = 4;

export interface EncodeOptions {
  dither: boolean;
}

export function ditherNoise(column: number, row: number): number {
  const first = unitFloat(hash3(column, row, 0, ditherSeedFirst));
  const second = unitFloat(hash3(column, row, 1, ditherSeedSecond));
  return first + second - 1;
}

export function encodeFrame(
  scene: Float32Array,
  glow: RgbImage | null,
  settings: RenderSettings,
  size: ViewportSize,
  options: EncodeOptions,
): Uint8ClampedArray<ArrayBuffer> {
  const { width, height } = size;
  const pixels = new Uint8ClampedArray(width * height * outputChannels);
  const paintOverlays = createOverlayPainter(settings, size);
  const bloomStrength = glow === null ? 0 : settings.bloomStrength;
  const ditherScale = defaultPost.ditherAmplitude / colorLevels;
  const scale = exposureScale(settings.exposure);
  const glowSample = new Float64Array(channelsPerSample);
  const color: MutableRgb = [0, 0, 0];
  let lastRed = Number.NaN;
  let lastGreen = Number.NaN;
  let lastBlue = Number.NaN;
  const lastEncoded: MutableRgb = [0, 0, 0];

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const source = (row * width + column) * channelsPerSample;
      let red = scene[source] ?? 0;
      let green = scene[source + 1] ?? 0;
      let blue = scene[source + 2] ?? 0;
      if (glow !== null && bloomStrength > 0) {
        sampleImage(glow, (column + 0.5) / width, (row + 0.5) / height, glowSample, 0);
        red += bloomStrength * (glowSample[0] ?? 0);
        green += bloomStrength * (glowSample[1] ?? 0);
        blue += bloomStrength * (glowSample[2] ?? 0);
      }
      if (red !== lastRed || green !== lastGreen || blue !== lastBlue) {
        displayEncodeInto(lastEncoded, red, green, blue, scale);
        lastRed = red;
        lastGreen = green;
        lastBlue = blue;
      }
      color[0] = lastEncoded[0];
      color[1] = lastEncoded[1];
      color[2] = lastEncoded[2];
      paintOverlays(color, column, row);
      const noise = options.dither ? ditherScale * ditherNoise(column, row) : 0;
      const target = (row * width + column) * outputChannels;
      pixels[target] = (color[0] + noise) * colorLevels;
      pixels[target + 1] = (color[1] + noise) * colorLevels;
      pixels[target + 2] = (color[2] + noise) * colorLevels;
      pixels[target + 3] = colorLevels;
    }
  }
  return pixels;
}
