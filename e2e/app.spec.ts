// Browser tests for the app shell and 3D viewport.
//
// How these work: Playwright starts the dev server (see playwright.config.ts), opens a real
// Chromium for each test, and drives it like a person would: loading pages, moving the mouse,
// clicking. `page` is that browser tab. `expect(...)` checks something, and most checks retry
// automatically for a few seconds until they pass, so there's rarely a need to sleep.
//
// Run:   npm run test:e2e                  (headless, prints results)
//        npx playwright test --headed      (watch the browser do it)
//        npx playwright test --ui          (step through each action, with snapshots)
//        npx playwright show-report        (open the HTML report from the last run)

import { expect, test } from '@playwright/test';
import { cameraPosition, distance, dragViewport, openApp } from './helpers';

test('loads the app without errors', async ({ page }) => {
  // Collect anything the page logs as an error, plus uncaught exceptions.
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));

  await openApp(page);

  // Locators find elements; prefer what a user sees (role, label, text) over CSS classes.
  await expect(page.getByRole('banner')).toContainText('Houston-1');
  await expect(page.getByLabel('Mission timer')).toHaveText('T-00:10');
  await expect(page.getByRole('complementary', { name: 'Control panel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset view' })).toBeVisible();

  // The canvas exists and WebGL started.
  const hasWebGL = await page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement) => canvas.getContext('webgl2') !== null,
  );
  expect(hasWebGL).toBe(true);

  expect(errors).toEqual([]);
});

test('dragging orbits the camera and the home button restores it', async ({ page }) => {
  await openApp(page);
  const home = await cameraPosition(page);

  await dragViewport(page);
  // expect.poll re-runs the function until the check passes (or times out). The camera keeps
  // gliding for a moment after the drag because of damping, so we wait for it.
  await expect.poll(async () => distance(await cameraPosition(page), home)).toBeGreaterThan(1);

  await page.getByRole('button', { name: 'Reset view' }).click();
  // The camera eases back over ~0.6 s.
  await expect.poll(async () => distance(await cameraPosition(page), home)).toBeLessThan(0.01);
});

test('with reduced motion, the home button jumps instead of easing', async ({ page }) => {
  // Pretend the OS has "reduce motion" switched on.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  const home = await cameraPosition(page);

  await dragViewport(page);
  await expect.poll(async () => distance(await cameraPosition(page), home)).toBeGreaterThan(1);

  await page.getByRole('button', { name: 'Reset view' }).click();
  // No polling here: the camera must already be home right after the click.
  expect(distance(await cameraPosition(page), home)).toBeLessThan(0.01);
});

test('on a phone-width screen the panel sits below the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openApp(page);

  const viewport = await page.getByRole('region', { name: '3D view of the rocket' }).boundingBox();
  const panel = await page.getByRole('complementary', { name: 'Control panel' }).boundingBox();
  expect(viewport && panel).toBeTruthy();
  expect(panel!.y).toBeGreaterThanOrEqual(viewport!.y + viewport!.height - 1);
  expect(panel!.width).toBeCloseTo(390, 0);
});

test('without WebGL, a text notice replaces the 3D view', async ({ page }) => {
  // addInitScript runs in the page before any of the app's code. Here it makes every
  // WebGL request fail, as on a browser or device without WebGL support.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type.startsWith('webgl')) return null;
      return (original as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto('/');

  await expect(page.getByText('3D view unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset view' })).toBeHidden();
  await expect(page.locator('[data-loading]')).toBeHidden();
  // The panel still works without the 3D view.
  await expect(page.getByRole('complementary', { name: 'Control panel' })).toBeVisible();
});
