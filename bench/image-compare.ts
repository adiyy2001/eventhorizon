import { type Page } from '@playwright/test';

export interface ImageDifference {
  mean: number;
  max: number;
}

export async function compareEncodedImages(
  page: Page,
  firstBase64: string,
  secondBase64: string,
): Promise<ImageDifference> {
  return page.evaluate(
    async ({ first, second }) => {
      const decoded = await Promise.all(
        [first, second].map(async (base64) => {
          const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d');
          if (context === null) {
            throw new Error('no 2d context');
          }
          context.drawImage(bitmap, 0, 0);
          return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        }),
      );
      const left = decoded[0];
      const right = decoded[1];
      if (left === undefined || right?.length !== left.length) {
        return { mean: Number.POSITIVE_INFINITY, max: Number.POSITIVE_INFINITY };
      }
      let total = 0;
      let count = 0;
      let max = 0;
      for (let index = 0; index < left.length; index += 1) {
        if (index % 4 !== 3) {
          const difference = Math.abs((left[index] ?? 0) - (right[index] ?? 0));
          total += difference;
          count += 1;
          max = Math.max(max, difference);
        }
      }
      return { mean: total / count, max };
    },
    { first: firstBase64, second: secondBase64 },
  );
}

export async function meanAbsoluteDifference(
  page: Page,
  firstBase64: string,
  secondBase64: string,
): Promise<number> {
  return (await compareEncodedImages(page, firstBase64, secondBase64)).mean;
}
