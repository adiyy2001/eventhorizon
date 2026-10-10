import { describe, expect, it } from 'vitest';
import { previewSpec } from '../bench/preview-orbit.ts';
import {
  encodeArguments,
  parseProbe,
  posterArguments,
  probeArguments,
  verifyVideo,
} from '../bench/preview-video.ts';

const options = {
  framesDirectory: '/work',
  framePattern: 'frame-%04d.png',
  output: '/out/preview.webm',
  crf: 34,
  spec: previewSpec,
};

function valueAfter(args: string[], flag: string): string | undefined {
  return args[args.indexOf(flag) + 1];
}

describe('encode arguments', () => {
  const args = encodeArguments(options);

  it('reads the numbered frames at the frame rate of the spec', () => {
    expect(valueAfter(args, '-framerate')).toBe(String(previewSpec.framesPerSecond));
    expect(valueAfter(args, '-i')).toBe('/work/frame-%04d.png');
  });

  it('encodes VP9 at a constant quality without audio', () => {
    expect(valueAfter(args, '-c:v')).toBe('libvpx-vp9');
    expect(valueAfter(args, '-b:v')).toBe('0');
    expect(valueAfter(args, '-crf')).toBe('34');
    expect(args).toContain('-an');
    expect(args.at(-1)).toBe('/out/preview.webm');
  });

  it('tags the colours so browsers show the sRGB frames unchanged', () => {
    expect(valueAfter(args, '-vf')).toContain('out_color_matrix=bt709');
    expect(valueAfter(args, '-colorspace')).toBe('bt709');
    expect(valueAfter(args, '-color_primaries')).toBe('bt709');
    expect(valueAfter(args, '-color_trc')).toBe('iec61966-2-1');
  });

  it('follows the quality factor it is given', () => {
    expect(valueAfter(encodeArguments({ ...options, crf: 40 }), '-crf')).toBe('40');
  });
});

describe('poster and probe arguments', () => {
  it('turns one frame into a JPEG', () => {
    const args = posterArguments('/work/frame-0000.png', '/out/poster.jpg');
    expect(valueAfter(args, '-i')).toBe('/work/frame-0000.png');
    expect(args.at(-1)).toBe('/out/poster.jpg');
  });

  it('asks ffprobe for JSON about the first video stream', () => {
    const args = probeArguments('/out/preview.webm');
    expect(valueAfter(args, '-of')).toBe('json');
    expect(valueAfter(args, '-select_streams')).toBe('v:0');
    expect(args.at(-1)).toBe('/out/preview.webm');
  });
});

describe('probe parsing', () => {
  const output = JSON.stringify({
    streams: [{ codec_name: 'vp9', width: 512, height: 512, nb_read_packets: '200' }],
    format: { duration: '10.000000' },
  });

  it('reads the stream and the duration', () => {
    expect(parseProbe(output)).toEqual({
      codec: 'vp9',
      width: 512,
      height: 512,
      frames: 200,
      seconds: 10,
    });
  });

  it('rejects output without a video stream', () => {
    expect(() => parseProbe(JSON.stringify({ streams: [], format: { duration: '1' } }))).toThrow(
      'video stream',
    );
  });

  it('rejects output without a duration', () => {
    expect(() =>
      parseProbe(
        JSON.stringify({ streams: [{ codec_name: 'vp9', width: 1, height: 1 }], format: {} }),
      ),
    ).toThrow('duration');
  });
});

describe('video verification', () => {
  const good = { codec: 'vp9', width: 512, height: 512, frames: 200, seconds: 10 };

  it('accepts a video that meets the spec', () => {
    expect(verifyVideo(good, 2_000_000, previewSpec)).toEqual([]);
  });

  it('names every way a video can miss the spec', () => {
    const problems = verifyVideo(
      { ...good, codec: 'vp8', width: 640, seconds: 20 },
      previewSpec.maxBytes + 1,
      previewSpec,
    );
    expect(problems).toHaveLength(4);
    expect(problems.join(' ')).toContain('vp8');
    expect(problems.join(' ')).toContain('640x512');
    expect(problems.join(' ')).toContain('20.00 s');
    expect(problems.join(' ')).toContain('bytes');
  });

  it('accepts the bounds of the duration and the size', () => {
    expect(verifyVideo({ ...good, seconds: 8 }, previewSpec.maxBytes, previewSpec)).toEqual([]);
    expect(verifyVideo({ ...good, seconds: 12 }, 1, previewSpec)).toEqual([]);
  });
});
