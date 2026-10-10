export interface DemoSpec {
  viewport: { width: number; height: number };
  framesPerSecond: number;
  cropHeight: number;
  gifWidth: number;
  colors: number;
  maxBytes: number;
  startInclinationDegrees: number;
  settleMilliseconds: number;
}

export const demoSpec: DemoSpec = {
  viewport: { width: 1280, height: 1260 },
  framesPerSecond: 10,
  cropHeight: 1010,
  gifWidth: 760,
  colors: 96,
  maxBytes: 8 * 1000 * 1000,
  startInclinationDegrees: 80,
  settleMilliseconds: 120,
};

export const demoDirectory = 'docs/media';
export const demoFile = 'demo.gif';
export const demoFramePattern = 'frame-%04d.png';

export type DemoAction =
  | { kind: 'hold' }
  | { kind: 'press'; fractionX: number; fractionY: number }
  | { kind: 'move'; fractionX: number; fractionY: number }
  | { kind: 'release' }
  | { kind: 'switch'; label: string; checked: boolean };

const lensing = 'Gravitational lensing';
const doppler = 'Doppler beaming';
const compare = 'Compare with the full model';

const repeat = (action: DemoAction, count: number): DemoAction[] =>
  Array.from({ length: count }, () => action);

function orbit(frames: number): DemoAction[] {
  const startX = 0.2;
  const spanX = 0.5;
  const wobble = 0.03;
  return [
    { kind: 'press', fractionX: startX, fractionY: 0.5 },
    ...Array.from({ length: frames }, (_, index): DemoAction => {
      const progress = (index + 1) / frames;
      return {
        kind: 'move',
        fractionX: startX + spanX * progress,
        fractionY: 0.5 + wobble * Math.sin(2 * Math.PI * progress),
      };
    }),
    { kind: 'release' },
  ];
}

function sweepDivider(from: number, to: number, frames: number): DemoAction[] {
  return [
    { kind: 'press', fractionX: from, fractionY: 0.5 },
    ...Array.from({ length: frames }, (_, index): DemoAction => {
      const progress = (index + 1) / frames;
      return { kind: 'move', fractionX: from + (to - from) * progress, fractionY: 0.5 };
    }),
    { kind: 'release' },
  ];
}

function compareWithout(label: string): DemoAction[] {
  return [
    { kind: 'switch', label, checked: false },
    ...repeat({ kind: 'hold' }, 5),
    ...sweepDivider(0.5, 0.82, 12),
    ...repeat({ kind: 'hold' }, 3),
    ...sweepDivider(0.82, 0.18, 22),
    ...repeat({ kind: 'hold' }, 3),
    ...sweepDivider(0.18, 0.5, 10),
    ...repeat({ kind: 'hold' }, 4),
    { kind: 'switch', label, checked: true },
    ...repeat({ kind: 'hold' }, 5),
  ];
}

export function demoActions(): DemoAction[] {
  return [
    ...repeat({ kind: 'hold' }, 6),
    ...orbit(54),
    ...repeat({ kind: 'hold' }, 6),
    { kind: 'switch', label: compare, checked: true },
    ...repeat({ kind: 'hold' }, 6),
    ...compareWithout(doppler),
    ...compareWithout(lensing),
    { kind: 'switch', label: compare, checked: false },
    ...repeat({ kind: 'hold' }, 10),
  ];
}

export function demoFrameName(frame: number): string {
  return `frame-${String(frame).padStart(4, '0')}.png`;
}

export interface GifArguments {
  framesDirectory: string;
  output: string;
  spec: DemoSpec;
}

export function gifArguments({ framesDirectory, output, spec }: GifArguments): string[] {
  const filters = [
    `fps=${String(spec.framesPerSecond)}`,
    `crop=${String(spec.viewport.width)}:${String(spec.cropHeight)}:0:0`,
    `scale=${String(spec.gifWidth)}:-1:flags=lanczos`,
  ].join(',');
  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-framerate',
    String(spec.framesPerSecond),
    '-i',
    `${framesDirectory}/${demoFramePattern}`,
    '-filter_complex',
    `[0:v]${filters},split[a][b];[a]palettegen=max_colors=${String(spec.colors)}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    '-loop',
    '0',
    output,
  ];
}
