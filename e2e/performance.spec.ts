// M5: the performance budget says no per-frame work while nothing changes (docs §8). The app
// renders on demand, so an idle page should draw no frames at all, which saves battery and
// keeps laptops cool. These tests count frames through the viewer's frame counter.

import { expect, test } from '@playwright/test';
import { frames, openApp } from './helpers';

test('an idle page draws no frames', async ({ page }) => {
  await openApp(page);
  await page.waitForTimeout(500); // let any start-up easing finish
  const before = await frames(page);
  await page.mouse.move(300, 300); // hovering alone shouldn't redraw
  await page.waitForTimeout(1000);
  expect(await frames(page)).toBe(before);
});

test('the page stops drawing once an animation settles', async ({ page }) => {
  await openApp(page);
  await page.getByRole('slider', { name: 'Explode' }).fill('1');
  // While the parts ease apart, frames are drawn...
  await expect.poll(() => frames(page)).toBeGreaterThan(5);
  // ...and once they've settled, drawing stops again.
  await page.waitForTimeout(1500);
  const settled = await frames(page);
  await page.waitForTimeout(800);
  expect(await frames(page)).toBe(settled);
});

test('a running flight draws continuously, and pausing stops it', async ({ page }) => {
  await openApp(page);
  await page.locator('[data-flight-primary]').click(); // Launch
  const start = await frames(page);
  await expect.poll(() => frames(page)).toBeGreaterThan(start + 10);

  await page.locator('[data-flight-primary]').click(); // Pause
  await page.waitForTimeout(300);
  const paused = await frames(page);
  await page.waitForTimeout(800);
  expect(await frames(page)).toBe(paused);
});
