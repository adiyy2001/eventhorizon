import { defaultSettings, type RenderSettings } from '../src/core/render/settings';
import { defaultView } from '../src/core/render/view';

export interface PreviewSpec {
  edge: number;
  seconds: number;
  framesPerSecond: number;
  accumulatedFrames: number;
  inclinationLowDegrees: number;
  inclinationHighDegrees: number;
  maxBytes: number;
  minSeconds: number;
  maxSeconds: number;
}

export const previewSpec: PreviewSpec = {
  edge: 512,
  seconds: 10,
  framesPerSecond: 20,
  accumulatedFrames: 4,
  inclinationLowDegrees: 20,
  inclinationHighDegrees: 85,
  maxBytes: 4 * 1024 * 1024,
  minSeconds: 8,
  maxSeconds: 12,
};

export const previewDirectory = 'public/media';
export const previewVideoFile = 'preview.webm';
export const previewPosterFile = 'preview-poster.jpg';
export const previewCaptionsFile = 'preview.vtt';

const turn = 2 * Math.PI;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

export function previewFrameCount(spec: PreviewSpec = previewSpec): number {
  return Math.round(spec.seconds * spec.framesPerSecond);
}

export function inclinationAt(progress: number, spec: PreviewSpec = previewSpec): number {
  const low = toRadians(spec.inclinationLowDegrees);
  const high = toRadians(spec.inclinationHighDegrees);
  const mean = (high + low) / 2;
  const amplitude = (high - low) / 2;
  const phase = Math.acos((defaultView.inclination - mean) / amplitude);
  return mean + amplitude * Math.cos(turn * progress + phase);
}

export function orbitSettings(progress: number, spec: PreviewSpec = previewSpec): RenderSettings {
  return {
    ...defaultSettings,
    view: {
      ...defaultView,
      azimuth: turn * progress,
      inclination: inclinationAt(progress, spec),
    },
  };
}

export function frameSettings(frame: number, spec: PreviewSpec = previewSpec): RenderSettings {
  return orbitSettings(frame / previewFrameCount(spec), spec);
}

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

function describeInclination(degrees: number): string {
  if (degrees >= 70) {
    return 'The disk is close to edge on, light from its far side is bent over the shadow and its underside shows below it.';
  }
  if (degrees >= 40) {
    return 'The lensed image of the far side of the disk wraps around the shadow.';
  }
  return 'The disk is nearly face on and forms a ring around the shadow.';
}

function turningPoints(spec: PreviewSpec): number[] {
  const low = toRadians(spec.inclinationLowDegrees);
  const high = toRadians(spec.inclinationHighDegrees);
  const phase = Math.acos((defaultView.inclination - (high + low) / 2) / ((high - low) / 2));
  return [(Math.PI - phase) / turn, 1 - phase / turn];
}

export function captionCues(spec: PreviewSpec = previewSpec): CaptionCue[] {
  const edges = [0, ...turningPoints(spec), 1].filter(
    (progress, index, all) => index === 0 || progress - (all[index - 1] ?? 0) > 1e-9,
  );
  return edges.slice(1).map((end, index) => {
    const start = edges[index] ?? 0;
    const from = toDegrees(inclinationAt(start, spec));
    const to = toDegrees(inclinationAt(end, spec));
    const direction = to < from ? 'falls' : 'rises';
    return {
      start: start * spec.seconds,
      end: end * spec.seconds,
      text: `The camera circles the black hole while its inclination ${direction} from ${String(Math.round(from))} to ${String(Math.round(to))} degrees. ${describeInclination(to)}`,
    };
  });
}

function timestamp(seconds: number): string {
  const wholeMilliseconds = Math.round(seconds * 1000);
  const minutes = Math.floor(wholeMilliseconds / 60000);
  const remainder = wholeMilliseconds - minutes * 60000;
  const secondsPart = Math.floor(remainder / 1000);
  const milliseconds = remainder - secondsPart * 1000;
  return `${String(minutes).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

export function captionsFile(cues: readonly CaptionCue[]): string {
  const body = cues
    .map((cue) => `${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text}`)
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

export const crfLadder: readonly number[] = [32, 34, 36, 38, 40, 42, 44, 46, 48, 50];

export const frameFilePattern = 'frame-%04d.png';

export function frameFileName(frame: number): string {
  return `frame-${String(frame).padStart(4, '0')}.png`;
}
