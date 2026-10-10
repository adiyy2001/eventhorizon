import { expect, test } from '@playwright/test';
import { openAutomationPage } from '../bench/gpu-session';
import type { ChurnResponse } from '../src/app/automation';

const cycles = 20;

test('the renderer can be created and destroyed 20 times without losing the device', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openAutomationPage(page);
  const response: ChurnResponse = await page.evaluate(
    async (payload) => {
      const automation = window.eventhorizonAutomation;
      if (automation === undefined) {
        throw new Error('automation hook is missing');
      }
      return automation.churnRenderers(payload);
    },
    { size: { width: 64, height: 64 }, cycles },
  );
  expect(response.cycles).toBe(cycles);
  expect(response.deviceLost).toBe(false);
});
