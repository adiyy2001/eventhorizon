import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Page } from '@playwright/test';
import { launchWebGpuBrowser } from '../bench/browser';
import { describeEnvironment } from '../bench/environment';
import { openAutomationPage } from '../bench/gpu-session';
import {
  captionCues,
  captionsFile,
  crfLadder,
  frameFileName,
  frameFilePattern,
  frameSettings,
  previewCaptionsFile,
  previewDirectory,
  previewFrameCount,
  previewPosterFile,
  previewSpec,
  previewVideoFile,
} from '../bench/preview-orbit';
import {
  encodeArguments,
  parseProbe,
  posterArguments,
  probeArguments,
  verifyVideo,
} from '../bench/preview-video';
import { startStaticServer } from '../bench/static-server';

const framesDirectory = join(tmpdir(), 'eventhorizon-preview-frames');
const resultPath = 'bench/results/preview-video.json';
const resume = process.env['PREVIEW_RESUME'] === '1';
const port = 4324;
const logEvery = 10;

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || String(result.error)}`);
  }
  return result.stdout;
}

function requireVp9Encoder(): string {
  const encoders = run('ffmpeg', ['-hide_banner', '-encoders']);
  if (!encoders.includes('libvpx-vp9')) {
    throw new Error('this ffmpeg build has no libvpx-vp9 encoder');
  }
  return run('ffmpeg', ['-version']).split('\n')[0] ?? 'ffmpeg';
}

function secondsSince(started: number): number {
  return (performance.now() - started) / 1000;
}

async function captureFrames(page: Page) {
  const count = previewFrameCount();
  const size = { width: previewSpec.edge, height: previewSpec.edge };
  const opened = await page.evaluate(
    async (request) => {
      const automation = window.eventhorizonAutomation;
      if (automation === undefined) {
        throw new Error('automation hook is missing');
      }
      return automation.openCapture(request);
    },
    { size },
  );
  const started = performance.now();
  let captured = 0;
  try {
    for (let frame = 0; frame < count; frame += 1) {
      const path = join(framesDirectory, frameFileName(frame));
      if (resume && existsSync(path) && statSync(path).size > 0) {
        continue;
      }
      const response = await page.evaluate(
        async (request) => {
          const automation = window.eventhorizonAutomation;
          if (automation === undefined) {
            throw new Error('automation hook is missing');
          }
          return automation.captureFrame(request);
        },
        { id: opened.id, settings: frameSettings(frame), frames: previewSpec.accumulatedFrames },
      );
      writeFileSync(path, Buffer.from(response.pngBase64, 'base64'));
      captured += 1;
      if (captured % logEvery === 0 || frame === count - 1) {
        const elapsed = secondsSince(started);
        const remaining = (elapsed / captured) * (count - frame - 1);
        console.log(
          `frame ${String(frame + 1)} of ${String(count)}, ${elapsed.toFixed(0)} s elapsed, about ${remaining.toFixed(0)} s left`,
        );
      }
    }
  } finally {
    await page.evaluate(
      async (request) => {
        await window.eventhorizonAutomation?.closeCapture(request);
      },
      { id: opened.id },
    );
  }
  return {
    adapter: opened.adapter,
    captured,
    secondsPerCapturedFrame: captured === 0 ? null : secondsSince(started) / captured,
  };
}

function encodeWithinBudget(output: string): { crf: number; bytes: number } {
  for (const crf of crfLadder) {
    run(
      'ffmpeg',
      encodeArguments({
        framesDirectory,
        framePattern: frameFilePattern,
        output,
        crf,
        spec: previewSpec,
      }),
    );
    const bytes = statSync(output).size;
    console.log(`crf ${String(crf)}: ${String(bytes)} bytes`);
    if (bytes <= previewSpec.maxBytes) {
      return { crf, bytes };
    }
  }
  throw new Error('no quality factor in the ladder fits the size limit');
}

async function main(): Promise<void> {
  const ffmpegVersion = requireVp9Encoder();
  if (!resume) {
    rmSync(framesDirectory, { recursive: true, force: true });
  }
  mkdirSync(framesDirectory, { recursive: true });
  mkdirSync(previewDirectory, { recursive: true });

  const server = await startStaticServer(port);
  const browser = await launchWebGpuBrowser();
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.requestAnimationFrame = () => 0;
    });
    await openAutomationPage(page, `${server.origin}/?automation`);
    const capture = await captureFrames(page);

    const videoPath = join(previewDirectory, previewVideoFile);
    const encoded = encodeWithinBudget(videoPath);
    run(
      'ffmpeg',
      posterArguments(
        join(framesDirectory, frameFileName(0)),
        join(previewDirectory, previewPosterFile),
      ),
    );
    writeFileSync(join(previewDirectory, previewCaptionsFile), captionsFile(captionCues()));

    const probe = parseProbe(run('ffprobe', probeArguments(videoPath)));
    const problems = verifyVideo(probe, encoded.bytes, previewSpec);
    const record = {
      ...describeEnvironment(browser, capture.adapter),
      ffmpeg: ffmpegVersion,
      spec: previewSpec,
      frames: previewFrameCount(),
      capturedThisRun: capture.captured,
      secondsPerCapturedFrame:
        capture.secondsPerCapturedFrame === null
          ? null
          : Number(capture.secondsPerCapturedFrame.toFixed(2)),
      crf: encoded.crf,
      bytes: encoded.bytes,
      video: probe,
      problems,
    };
    mkdirSync('bench/results', { recursive: true });
    writeFileSync(resultPath, `${JSON.stringify(record, null, 2)}\n`);
    console.log(
      `${previewVideoFile}: ${probe.seconds.toFixed(2)} s, ${String(encoded.bytes)} bytes, crf ${String(encoded.crf)}`,
    );
    if (problems.length > 0) {
      console.error(problems.join('\n'));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.stop();
  }
}

await main();
