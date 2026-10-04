import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const artifactDirectory = join('test-results', 'interface');
const renderTimeout = 90_000;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.getByTestId('viewport-canvas')).toHaveAttribute('data-state', 'rendered', {
    timeout: renderTimeout,
  });
}

async function setRange(page: Page, id: string, value: number): Promise<void> {
  await page.locator(`input#${id}`).evaluate((element, next) => {
    const input = element as HTMLInputElement;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function search(page: Page): Promise<string> {
  return page.evaluate(() => window.location.search);
}

test.describe('settings and the address', () => {
  test('a slider updates the address and a reload restores the state', async ({ page }) => {
    await open(page);
    await setRange(page, 'inclination', 40);
    await expect.poll(() => search(page)).toContain('inc=40');
    await page.reload();
    await expect(page.getByTestId('viewport-canvas')).toHaveAttribute('data-state', 'rendered', {
      timeout: renderTimeout,
    });
    await expect(page.locator('input#inclination')).toHaveValue('40');
    await expect(page.getByTestId('inclination-value')).toHaveText('40 degrees');
    await expect(page.getByTestId('viewport-canvas')).toHaveAttribute(
      'aria-label',
      /Inclination 40 degrees/,
    );
  });

  test('switches, overlays and the divider are kept in the address', async ({ page }) => {
    await open(page);
    await page.getByRole('switch', { name: 'Doppler beaming' }).uncheck();
    await page.getByRole('switch', { name: 'Photon sphere' }).check();
    await page.getByRole('switch', { name: 'Compare with the full model' }).check();
    await expect.poll(() => search(page)).toMatch(/off=d/);
    await expect.poll(() => search(page)).toContain('ov=p');
    await expect.poll(() => search(page)).toContain('sp=0.5');
    await page.reload();
    await expect(page.getByTestId('viewport-canvas')).toHaveAttribute('data-state', 'rendered', {
      timeout: renderTimeout,
    });
    await expect(page.getByRole('switch', { name: 'Doppler beaming' })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: 'Photon sphere' })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Compare with the full model' })).toBeChecked();
    await expect(page.getByTestId('overlay-legend')).toContainText('Photon sphere');
  });

  test('a garbage address falls back to the defaults', async ({ page }) => {
    await open(page, '?v=1&dist=abc&inc=999999&off=%%%&sp=zz');
    await expect(page.getByTestId('viewport-canvas')).toHaveAttribute(
      'aria-label',
      /Inclination 179 degrees/,
    );
    await expect(page.locator('input#distance')).toHaveValue('50');
    await open(page, '?v=9&dist=20');
    await expect(page.locator('input#distance')).toHaveValue('50');
  });

  test('reset returns every setting and clears the address', async ({ page }) => {
    await open(page, '?v=1&dist=20&ev=1');
    await expect(page.locator('input#distance')).toHaveValue('20');
    await page.getByTestId('reset').click();
    await expect(page.locator('input#distance')).toHaveValue('50');
    await expect.poll(() => search(page)).toBe('');
  });
});

test.describe('keyboard and pointer', () => {
  test('arrow keys orbit and change the address, Home resets', async ({ page }) => {
    await open(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => search(page)).toMatch(/az=6/);
    expect(await search(page)).toMatch(/inc=78/);
    await expect(page.getByTestId('announcer')).toContainText('azimuth 6 degrees');
    await page.keyboard.press('PageUp');
    await expect.poll(() => search(page)).toMatch(/dist=45\.45/);
    await page.keyboard.press('Home');
    await expect.poll(() => search(page)).toBe('');
  });

  test('keys belong to a focused slider and do not orbit', async ({ page }) => {
    await open(page);
    await page.locator('input#distance').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    expect(await search(page)).not.toContain('az=');
    expect(await search(page)).toContain('dist=51');
  });

  test('the question mark opens the help and Escape closes it', async ({ page }) => {
    await open(page);
    await page.keyboard.press('?');
    await expect(page.getByTestId('keyboard-help')).toBeVisible();
    await expect(page.getByTestId('close-help')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('keyboard-help')).toBeHidden();
  });

  test('dragging the image orbits and the wheel zooms', async ({ page }) => {
    await open(page);
    const box = await page.getByTestId('viewport-canvas').boundingBox();
    if (box === null) {
      throw new Error('canvas has no box');
    }
    const startX = box.x + box.width * 0.3;
    const startY = box.y + box.height * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 60, startY + 40, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => search(page)).toContain('az=-27.5');
    expect(await search(page)).toMatch(/inc=56\.67/);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -300);
    await expect.poll(() => search(page)).toMatch(/dist=3[0-9]\./);
  });

  test('the divider can be dragged when the compare view is on', async ({ page }) => {
    await open(page, '?v=1&sp=0.5');
    const box = await page.getByTestId('viewport-canvas').boundingBox();
    if (box === null) {
      throw new Error('canvas has no box');
    }
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 4 });
    await page.mouse.up();
    await expect.poll(() => search(page)).toContain('sp=0.75');
    expect(await search(page)).not.toContain('az=');
  });
});

test.describe('physics panel', () => {
  test('opens and renders every equation without a KaTeX error', async ({ page }) => {
    await open(page);
    await page.getByTestId('show-physics').click();
    const panel = page.getByTestId('physics-panel');
    await expect(panel).toBeVisible();
    const equations = panel.locator('app-equation');
    const count = await equations.count();
    expect(count).toBeGreaterThanOrEqual(10);
    for (let index = 0; index < count; index += 1) {
      await expect(equations.nth(index)).toHaveAttribute('data-state', 'rendered');
    }
    await expect(panel.locator('.katex-error')).toHaveCount(0);
    await expect(panel.locator('.katex')).toHaveCount(count);
    await expect(panel.locator('math')).toHaveCount(count);
    const links = panel.getByRole('link');
    expect(await links.count()).toBe(count);
    expect(await links.first().getAttribute('href')).toMatch(/physics\.md#2-null-geodesics/);
  });

  test('the equation fonts load from the bundle', async ({ page }) => {
    const fonts: string[] = [];
    page.on('response', (response) => {
      if (/KaTeX_.*\.woff2/.test(response.url())) {
        fonts.push(response.url());
      }
    });
    await open(page);
    await page.getByTestId('show-physics').click();
    await expect(page.getByTestId('physics-panel').locator('.katex').first()).toBeVisible();
    await page.evaluate(async () => document.fonts.ready.then(() => undefined));
    await expect.poll(() => fonts.length).toBeGreaterThan(0);
  });
});

test.describe('accessibility', () => {
  test('tab order reaches every control and focus is visible', async ({ page }) => {
    await open(page);
    const expected = await page
      .locator('app-control-panel input, app-control-panel button:not([disabled])')
      .evaluateAll((elements) =>
        elements.map((element) => element.id || (element.getAttribute('data-testid') ?? '')),
      );
    expect(expected.length).toBeGreaterThanOrEqual(15);
    const visited = new Set<string>();
    for (let step = 0; step < 60; step += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const element = document.activeElement;
        if (element === null || element === document.body) {
          return null;
        }
        const style = getComputedStyle(element);
        return {
          key: element.id || (element.getAttribute('data-testid') ?? ''),
          outline: Number.parseFloat(style.outlineWidth),
          outlineStyle: style.outlineStyle,
        };
      });
      if (focused !== null && focused.key !== '') {
        visited.add(focused.key);
        expect(focused.outlineStyle).not.toBe('none');
        expect(focused.outline).toBeGreaterThanOrEqual(2);
      }
    }
    for (const key of expected) {
      expect(visited, key).toContain(key);
    }
  });

  test('every slider and switch has an accessible name and the sliders speak their value', async ({
    page,
  }) => {
    await open(page);
    const sliders = page.getByRole('slider');
    expect(await sliders.count()).toBe(6);
    for (const slider of await sliders.all()) {
      await expect(slider).toHaveAccessibleName(/.+/);
      await expect(slider).toHaveAttribute('aria-valuetext', /.+/);
    }
    const switches = page.getByRole('switch');
    expect(await switches.count()).toBe(8);
    for (const item of await switches.all()) {
      await expect(item).toHaveAccessibleName(/.+/);
      await expect(item).toHaveAccessibleDescription(/.+/);
    }
  });

  test('state changes are announced politely', async ({ page }) => {
    await open(page);
    const announcer = page.getByTestId('announcer');
    await expect(announcer).toHaveAttribute('aria-live', 'polite');
    await setRange(page, 'exposure', 1.5);
    await expect(announcer).toContainText('Exposure 1.5 EV');
    await page.getByRole('switch', { name: 'Gravitational lensing' }).uncheck();
    await expect(announcer).toContainText('Gravitational lensing off');
  });

  test('the canvas is an image whose description follows the settings', async ({ page }) => {
    await open(page);
    const canvas = page.getByTestId('viewport-canvas');
    await expect(canvas).toHaveAttribute('role', 'img');
    await page.getByRole('switch', { name: 'Shadow edge' }).check();
    await expect(canvas).toHaveAttribute('aria-label', /Overlays: shadow edge/);
  });

  test('the layout never scrolls sideways', async ({ page }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 640 },
    ]) {
      await page.setViewportSize(viewport);
      await open(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${String(viewport.width)} px`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('screenshots of the interface', () => {
  test.beforeAll(() => {
    mkdirSync(artifactDirectory, { recursive: true });
  });

  test('desktop controls and physics', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await page.screenshot({ path: join(artifactDirectory, 'desktop-controls.png') });
    await page.getByTestId('show-physics').click();
    await expect(page.getByTestId('physics-panel').locator('app-equation').first()).toHaveAttribute(
      'data-state',
      'rendered',
    );
    await page.screenshot({ path: join(artifactDirectory, 'desktop-physics.png') });
  });

  test('phone sheet closed and open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const toggle = page.getByTestId('sheet-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('app-control-panel')).toHaveCount(1);
    await expect(page.locator('input#distance')).toBeHidden();
    await page.screenshot({ path: join(artifactDirectory, 'phone-closed.png') });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('input#distance')).toBeVisible();
    await page.screenshot({ path: join(artifactDirectory, 'phone-open.png') });
  });
});
