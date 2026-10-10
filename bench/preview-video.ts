import { type PreviewSpec } from './preview-orbit';

export interface EncodeOptions {
  framesDirectory: string;
  framePattern: string;
  output: string;
  crf: number;
  spec: PreviewSpec;
}

export function encodeArguments(options: EncodeOptions): string[] {
  const { framesDirectory, framePattern, output, crf, spec } = options;
  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-framerate',
    String(spec.framesPerSecond),
    '-i',
    `${framesDirectory}/${framePattern}`,
    '-vf',
    'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p',
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    String(crf),
    '-row-mt',
    '1',
    '-deadline',
    'good',
    '-cpu-used',
    '1',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'iec61966-2-1',
    '-color_range',
    'tv',
    '-an',
    output,
  ];
}

export function posterArguments(frame: string, output: string): string[] {
  return ['-y', '-hide_banner', '-loglevel', 'error', '-i', frame, '-q:v', '3', output];
}

export function probeArguments(file: string): string[] {
  return [
    '-v',
    'error',
    '-count_packets',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name,width,height,nb_read_packets:format=duration',
    '-of',
    'json',
    file,
  ];
}

export interface ProbeSummary {
  codec: string;
  width: number;
  height: number;
  frames: number;
  seconds: number;
}

interface ProbeOutput {
  streams?: { codec_name?: string; width?: number; height?: number; nb_read_packets?: string }[];
  format?: { duration?: string };
}

export function parseProbe(text: string): ProbeSummary {
  const parsed = JSON.parse(text) as ProbeOutput;
  const stream = parsed.streams?.[0];
  const duration = Number(parsed.format?.duration);
  if (
    stream?.codec_name === undefined ||
    stream.width === undefined ||
    stream.height === undefined
  ) {
    throw new Error('ffprobe did not report a video stream');
  }
  if (!Number.isFinite(duration)) {
    throw new Error('ffprobe did not report a duration');
  }
  return {
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
    frames: Number(stream.nb_read_packets ?? 0),
    seconds: duration,
  };
}

export function verifyVideo(summary: ProbeSummary, bytes: number, spec: PreviewSpec): string[] {
  const problems: string[] = [];
  if (summary.codec !== 'vp9') {
    problems.push(`codec is ${summary.codec}, expected vp9`);
  }
  if (summary.width !== spec.edge || summary.height !== spec.edge) {
    problems.push(
      `size is ${String(summary.width)}x${String(summary.height)}, expected ${String(spec.edge)}x${String(spec.edge)}`,
    );
  }
  if (summary.seconds < spec.minSeconds || summary.seconds > spec.maxSeconds) {
    problems.push(
      `duration is ${summary.seconds.toFixed(2)} s, expected ${String(spec.minSeconds)} to ${String(spec.maxSeconds)} s`,
    );
  }
  if (bytes > spec.maxBytes) {
    problems.push(`file is ${String(bytes)} bytes, limit is ${String(spec.maxBytes)}`);
  }
  return problems;
}
