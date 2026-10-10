import { expect, type Page, test } from '@playwright/test';

interface SimulatedLoss {
  reason: string;
  message: string;
}

declare global {
  interface Window {
    loseGraphicsDevice?: () => void;
  }
}

const renderTimeout = 90_000;
const finalImageTimeout = 180_000;

function canvasOf(page: Page) {
  return page.getByTestId('viewport-canvas');
}

async function expectSoftwareRenderingFor(page: Page, status: string, detail: string) {
  await expect(page.getByTestId('fallback-banner')).toBeVisible({ timeout: renderTimeout });
  await expect(page.getByTestId('gpu-status')).toHaveText(status);
  await expect(page.getByTestId('fallback-detail')).toContainText(detail);
  await expect(canvasOf(page)).toHaveAttribute('data-backend', 'cpu');
  await expect(canvasOf(page)).toHaveAttribute('data-complete', 'true', {
    timeout: finalImageTimeout,
  });
}

test.describe('routes to the software renderer with a working adapter', () => {
  test('a device that cannot be created', async ({ page }) => {
    await page.addInitScript(() => {
      GPUAdapter.prototype.requestDevice = () =>
        Promise.reject(new Error('simulated device failure'));
    });
    await page.goto('/');
    await expectSoftwareRenderingFor(
      page,
      'A graphics adapter was found but a device could not be created.',
      'simulated device failure',
    );
  });

  test('a renderer that cannot start', async ({ page }) => {
    await page.addInitScript(() => {
      GPUDevice.prototype.createTexture = () => {
        throw new Error('simulated texture failure');
      };
    });
    await page.goto('/');
    await expectSoftwareRenderingFor(
      page,
      'The graphics renderer could not start.',
      'simulated texture failure',
    );
  });

  test('a device lost while rendering', async ({ page }) => {
    await page.addInitScript(() => {
      const resolvers: ((loss: SimulatedLoss) => void)[] = [];
      const requestDevice = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = async function (
        this: GPUAdapter,
        descriptor?: GPUDeviceDescriptor,
      ) {
        const device = await requestDevice.call(this, descriptor);
        const lost = new Promise<SimulatedLoss>((resolve) => {
          resolvers.push(resolve);
        });
        Object.defineProperty(device, 'lost', { value: lost });
        return device;
      };
      window.loseGraphicsDevice = () => {
        resolvers.forEach((resolve) => {
          resolve({ reason: 'unknown', message: 'simulated device loss' });
        });
      };
    });
    await page.goto('/');
    await expect(canvasOf(page)).toHaveAttribute('data-backend', 'gpu');
    await expect(canvasOf(page)).toHaveAttribute('data-state', 'rendered', {
      timeout: renderTimeout,
    });
    await expect(page.getByTestId('fallback-banner')).toHaveCount(0);
    await page.evaluate(() => {
      window.loseGraphicsDevice?.();
    });
    await expectSoftwareRenderingFor(
      page,
      'The graphics device was lost while rendering.',
      'simulated device loss',
    );
  });
});
