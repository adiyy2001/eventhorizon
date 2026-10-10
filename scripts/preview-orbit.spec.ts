import { describe, expect, it } from 'vitest';
import {
  captionCues,
  captionsFile,
  crfLadder,
  frameFileName,
  frameSettings,
  inclinationAt,
  orbitSettings,
  previewFrameCount,
  previewSpec,
} from '../bench/preview-orbit.ts';
import { defaultView } from '../src/core/render/view.ts';

const degrees = (radians: number): number => (radians * 180) / Math.PI;

describe('preview orbit', () => {
  it('lasts between the allowed bounds', () => {
    const seconds = previewFrameCount() / previewSpec.framesPerSecond;
    expect(seconds).toBeGreaterThanOrEqual(previewSpec.minSeconds);
    expect(seconds).toBeLessThanOrEqual(previewSpec.maxSeconds);
    expect(Number.isInteger(previewFrameCount())).toBe(true);
  });

  it('starts at the default view', () => {
    const first = frameSettings(0).view;
    expect(first.inclination).toBeCloseTo(defaultView.inclination, 12);
    expect(first.azimuth).toBe(0);
    expect(first.distance).toBe(defaultView.distance);
    expect(first.diskOuterRadius).toBe(defaultView.diskOuterRadius);
  });

  it('closes the loop so the video repeats without a jump', () => {
    const wrapped = orbitSettings(1).view;
    const first = orbitSettings(0).view;
    expect(wrapped.inclination).toBeCloseTo(first.inclination, 12);
    expect(Math.cos(wrapped.azimuth)).toBeCloseTo(Math.cos(first.azimuth), 12);
    expect(Math.sin(wrapped.azimuth)).toBeCloseTo(Math.sin(first.azimuth), 12);
  });

  it('sweeps the whole turn of azimuth and stays inside the inclination bounds', () => {
    const count = previewFrameCount();
    const views = Array.from({ length: count }, (_, frame) => frameSettings(frame).view);
    const inclinations = views.map((view) => degrees(view.inclination));
    expect(Math.min(...inclinations)).toBeGreaterThanOrEqual(
      previewSpec.inclinationLowDegrees - 1e-9,
    );
    expect(Math.max(...inclinations)).toBeLessThanOrEqual(
      previewSpec.inclinationHighDegrees + 1e-9,
    );
    expect(Math.min(...inclinations)).toBeLessThan(previewSpec.inclinationLowDegrees + 1);
    expect(Math.max(...inclinations)).toBeGreaterThan(previewSpec.inclinationHighDegrees - 1);
    const azimuths = views.map((view) => view.azimuth);
    expect(azimuths).toEqual([...azimuths].sort((a, b) => a - b));
    expect(azimuths.at(-1)).toBeCloseTo((2 * Math.PI * (count - 1)) / count, 12);
  });

  it('moves smoothly between neighbouring frames', () => {
    const count = previewFrameCount();
    for (let frame = 1; frame < count; frame += 1) {
      const step = Math.abs(inclinationAt(frame / count) - inclinationAt((frame - 1) / count));
      expect(degrees(step)).toBeLessThan(3);
    }
  });

  it('keeps the other settings at their defaults', () => {
    const settings = frameSettings(10);
    expect(settings.overlays).toEqual({ photonSphere: false, isco: false, shadowEdge: false });
    expect(settings.split.enabled).toBe(false);
    expect(settings.exposure).toBe(0);
  });
});

describe('preview captions', () => {
  const cues = captionCues();

  it('covers the whole video without gaps or overlaps', () => {
    expect(cues[0]?.start).toBe(0);
    expect(cues.at(-1)?.end).toBeCloseTo(previewSpec.seconds, 12);
    cues.slice(1).forEach((cue, index) => {
      expect(cue.start).toBeCloseTo(cues[index]?.end ?? Number.NaN, 12);
    });
  });

  it('splits the loop where the camera turns around', () => {
    expect(cues).toHaveLength(3);
    expect(
      cues.map((cue) => /(falls|rises) from (\d+) to (\d+) degrees/.exec(cue.text)?.slice(1)),
    ).toEqual([
      ['falls', '75', '20'],
      ['rises', '20', '85'],
      ['falls', '85', '75'],
    ]);
  });

  it('describes the disk as it looks at the end of each segment', () => {
    expect(cues[0]?.text).toContain('nearly face on');
    expect(cues[1]?.text).toContain('close to edge on');
    expect(cues[2]?.text).toContain('close to edge on');
  });

  it('describes a middle band too', () => {
    const middle = captionCues({ ...previewSpec, inclinationLowDegrees: 45 });
    expect(middle[0]?.text).toContain('wraps around the shadow');
  });

  it('writes a WebVTT file with millisecond timestamps', () => {
    const file = captionsFile(cues);
    expect(file.startsWith('WEBVTT\n\n00:00.000 --> 00:03.')).toBe(true);
    expect(file).toContain('--> 00:10.000\n');
    expect(file.endsWith('\n')).toBe(true);
    expect(file.split('\n\n')).toHaveLength(cues.length + 1);
  });

  it('writes no dashes other than the cue arrow', () => {
    expect(captionsFile(cues).replaceAll('-->', '')).not.toMatch(/[-\u2013\u2014]/);
  });
});

describe('preview encoding', () => {
  it('offers a rising ladder of quality factors', () => {
    expect([...crfLadder]).toEqual([...crfLadder].sort((a, b) => a - b));
    expect(crfLadder.length).toBeGreaterThan(3);
  });

  it('numbers frame files so ffmpeg can read them in order', () => {
    expect(frameFileName(0)).toBe('frame-0000.png');
    expect(frameFileName(199)).toBe('frame-0199.png');
  });
});
