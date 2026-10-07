// M5: the performance budget says no per-frame work while nothing changes (docs §8). The app
// renders on demand, so an idle page should draw no frames at all, which saves battery and
// keeps laptops cool. These tests count frames through the viewer's frame counter.
//
// Animations take longer on slow machines (CI renders in software at a low frame rate), so
// the tests never assume how long something takes: they wait until drawing has stopped,
// then check that it stays stopped.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { frames, openApp } from './helpers';

/** Waits (up to 15 s) until no frames are drawn over a 400 ms window. */
async function waitForIdle(page: Page): Promise<void> {
  await expect.poll(async () => {
    const before = await frames(page);
    await page.waitForTimeout(400);
    return (await frames(page)) - before;
  }, { timeout: 15_000, message: 'the page never stopped drawing' }).toBe(0);
}

/** Checks that no frames are drawn for a while. */
async function expectStaysIdle(page: Page): Promise<void> {
  const before = await frames(page);
  await page.waitForTimeout(1000);
  expect(await frames(page)).toBe(before);
}

test('an idle page draws no frames', async ({ page }) => {
  await openApp(page);
  await waitForIdle(page);
  await page.mouse.move(300, 300); // hovering alone shouldn't redraw
  await expectStaysIdle(page);
});

test('the page stops drawing once an animation settles', async ({ page }) => {
  await openApp(page);
  await waitForIdle(page);
  const start = await frames(page);

  // Exploding eases the parts apart, then the camera eases out to frame them.
  await page.getByRole('slider', { name: 'Explode' }).fill('1');
  await expect.poll(() => frames(page)).toBeGreaterThan(start);

  await waitForIdle(page);
  await expectStaysIdle(page);
});

test('a running flight draws continuously, and pausing stops it', async ({ page }) => {
  await openApp(page);
  await page.locator('[data-flight-primary]').click(); // Launch
  const start = await frames(page);
  await expect.poll(() => frames(page)).toBeGreaterThan(start + 10);

  await page.locator('[data-flight-primary]').click(); // Pause
  await waitForIdle(page);
  await expectStaysIdle(page);
});
