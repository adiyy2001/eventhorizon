import { statSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { previewSpec } from '../bench/preview-orbit';

const bannerTimeout = 60_000;

test.describe('the recorded preview', () => {
  test('is a short VP9 WebM with a poster and a text description', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.getByTestId('fallback-banner')).toBeVisible({ timeout: bannerTimeout });

    const poster = await request.get('media/preview-poster.jpg');
    expect(poster.ok()).toBe(true);
    expect(poster.headers()['content-type']).toBe('image/jpeg');

    const video = await request.get('media/preview.webm');
    expect(video.ok()).toBe(true);
    expect(video.headers()['content-type']).toBe('video/webm');
    expect((await video.body()).length).toBeLessThanOrEqual(previewSpec.maxBytes);
    expect(statSync('public/media/preview.webm').size).toBeLessThanOrEqual(previewSpec.maxBytes);

    const description = await page.getByTestId('preview-video').evaluate(async (element) => {
      if (!(element instanceof HTMLVideoElement)) {
        throw new Error('the preview is not a video element');
      }
      element.preload = 'metadata';
      await new Promise<void>((resolve, reject) => {
        element.addEventListener('loadedmetadata', () => {
          resolve();
        });
        element.addEventListener('error', () => {
          reject(new Error('the preview did not load'));
        });
        element.load();
      });
      const track = element.textTracks[0];
      if (track === undefined) {
        throw new Error('the preview has no text track');
      }
      track.mode = 'hidden';
      await new Promise<void>((resolve) => {
        const check = (): void => {
          if ((track.cues?.length ?? 0) > 0) {
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
      return {
        duration: element.duration,
        width: element.videoWidth,
        height: element.videoHeight,
        autoplay: element.autoplay,
        trackKind: track.kind,
        cues: track.cues?.length ?? 0,
      };
    });
    expect(description.duration).toBeGreaterThanOrEqual(previewSpec.minSeconds);
    expect(description.duration).toBeLessThanOrEqual(previewSpec.maxSeconds);
    expect(description.width).toBe(previewSpec.edge);
    expect(description.height).toBe(previewSpec.edge);
    expect(description.autoplay).toBe(false);
    expect(description.trackKind).toBe('captions');
    expect(description.cues).toBeGreaterThan(0);
  });

  test('plays when asked to', async ({ page }) => {
    await page.goto('/');
    const video = page.getByTestId('preview-video');
    await expect(video).toBeVisible({ timeout: bannerTimeout });
    const played = await video.evaluate(async (element) => {
      if (!(element instanceof HTMLVideoElement)) {
        throw new Error('the preview is not a video element');
      }
      await element.play();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1500);
      });
      const advanced = element.currentTime;
      element.pause();
      return advanced;
    });
    expect(played).toBeGreaterThan(0.5);
  });
});
