import { expect, test } from '@playwright/test';

test.describe('WebGPU in the production build', () => {
  test('the page has a WebGPU adapter', async ({ page }) => {
    await page.goto('/');
    const architecture = await page.evaluate(async () => {
      const adapter = await navigator.gpu.requestAdapter();
      return adapter?.info.architecture ?? null;
    });
    expect(architecture).not.toBeNull();
  });

  test('the shell reports a ready device and a correct compute kernel', async ({ page }) => {
    await page.goto('/');
    const status = page.getByTestId('gpu-status');
    await expect(status).toHaveAttribute('data-state', 'ready');
    await expect(status).toHaveText('WebGPU is ready.');
    await expect(page.getByTestId('smoke-result')).toContainText('1000 of 1000 values correct');
  });

  test('without WebGPU the shell explains why', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByTestId('gpu-status')).toHaveAttribute('data-state', 'unsupported');
    await context.close();
  });
});
