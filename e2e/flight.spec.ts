// M4: the simulated flight. Most checks scrub to a mission time rather than waiting for the
// clock, because everything on screen is a pure function of time: scrubbing to T+02:43 gives
// exactly the same scene as watching until then, and keeps the tests fast and deterministic.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cameraPosition, exhaust, flight, openApp, part } from './helpers';

const primary = (page: Page) => page.locator('[data-flight-primary]');   // Launch / Pause / Resume
const stop = (page: Page) => page.locator('[data-flight-stop]');         // Abort / Reset
const scrub = (page: Page) => page.getByRole('slider', { name: 'Mission time' });
const eventTitle = (page: Page) => page.locator('[data-flight-event]');
const phase = (page: Page) => page.getByLabel('Flight phase');
const timer = (page: Page) => page.getByLabel('Mission timer');

/** Jumps the mission clock, like dragging the scrub bar. */
const scrubTo = (page: Page, t: number) => scrub(page).fill(String(t));

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('launch reassembles the rocket, says so, and starts the countdown', async ({ page }) => {
  await page.getByRole('slider', { name: 'Explode' }).fill('0.5');
  await page.getByRole('checkbox', { name: 'Show Fins' }).uncheck();

  await primary(page).click();

  await expect(page.getByText('The rocket was reassembled')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Show Fins' })).toBeChecked();
  await expect(page.getByRole('slider', { name: 'Explode' })).toBeDisabled();
  await expect(phase(page)).toHaveText('Countdown');
  await expect(primary(page)).toHaveText('Pause');
  // The clock is running.
  await expect.poll(async () => (await flight(page)).t).toBeGreaterThan(-9.5);
});

test('pause stops the clock and resume restarts it', async ({ page }) => {
  await primary(page).click();
  await primary(page).click(); // Pause
  await expect(primary(page)).toHaveText('Resume');
  await expect(phase(page)).toHaveText('Countdown · Paused');

  const t = (await flight(page)).t;
  await page.waitForTimeout(400);
  expect((await flight(page)).t).toBe(t);

  await primary(page).click(); // Resume
  await expect.poll(async () => (await flight(page)).t).toBeGreaterThan(t);
});

test('speed can be changed', async ({ page }) => {
  await primary(page).click();
  // The speed control is a group of radio buttons styled as a segmented control. check()
  // selects a radio the way a user would (click, or arrow keys) and verifies it took.
  await page.getByRole('radio', { name: '4×' }).check();
  await expect(page.getByRole('radio', { name: '4×' })).toBeChecked();
  expect((await flight(page)).speed).toBe(4);
});

test('scrubbing stages the rocket, and scrubbing back re-docks it', async ({ page }) => {
  // Scrubbing from the pad enters the flight, paused.
  await scrubTo(page, 163);
  expect(await flight(page)).toMatchObject({ phase: 'second-stage', playing: false });
  await expect(eventTitle(page)).toHaveText('Second-stage ignition');
  await expect(timer(page)).toHaveText('T+02:43');

  // 10 s after separation at 1.5 units/s, the booster has fallen 15 units behind.
  expect((await part(page, 'stage1')).position[1]).toBeCloseTo(-15, 3);
  expect(await exhaust(page, 'stage2.engine')).toBe(true);
  expect(await exhaust(page, 'stage1.engines')).toBe(false);

  await scrubTo(page, 100);
  await expect(eventTitle(page)).toHaveText('Max-Q');
  expect((await part(page, 'stage1')).position[1]).toBeCloseTo(0, 5);
  expect(await exhaust(page, 'stage1.engines')).toBe(true);
  expect(await exhaust(page, 'stage2.engine')).toBe(false);
});

test('the mission timeline jumps to an event', async ({ page }) => {
  await page.getByText('Mission timeline').click(); // opens the <details>
  const jettison = page.getByRole('button', { name: /Fairing jettison/ });
  await jettison.click();

  await expect(timer(page)).toHaveText('T+03:20');
  await expect(eventTitle(page)).toHaveText('Fairing jettison');
  await expect(jettison).toHaveAttribute('aria-current', 'step');
});

test('the chase camera follows the rocket up, and Home finds it there', async ({ page }) => {
  const ground = await cameraPosition(page);
  await scrubTo(page, 300);
  // The stack climbs 900 units by T+05:00 (see stackAltitudeAt); the camera goes with it.
  await expect.poll(async () => (await cameraPosition(page))[1] - ground[1]).toBeGreaterThan(850);

  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect.poll(async () => (await cameraPosition(page))[1] - ground[1]).toBeCloseTo(900, 0);
});

test('abort freezes the flight; reset returns to the pad', async ({ page }) => {
  const ground = await cameraPosition(page);
  await scrubTo(page, 120);

  await stop(page).click(); // Abort
  await expect(phase(page)).toHaveText('Aborted');
  await expect(eventTitle(page)).toHaveText('Aborted');
  await expect(primary(page)).toBeDisabled();
  await expect(scrub(page)).toBeDisabled();
  await expect(stop(page)).toHaveText('Reset');

  await stop(page).click(); // Reset
  await expect(phase(page)).toHaveText('On pad');
  await expect(timer(page)).toHaveText('T-00:10');
  await expect(primary(page)).toHaveText('Launch');
  await expect(page.getByRole('slider', { name: 'Explode' })).toBeEnabled();
  await expect.poll(async () => Math.abs((await cameraPosition(page))[1] - ground[1])).toBeLessThan(0.01);
});

test('the flight ends in orbit', async ({ page }) => {
  await scrubTo(page, 510);
  await expect(eventTitle(page)).toHaveText('SECO: orbit');
  await expect(phase(page)).toHaveText('Orbit');
  await expect(primary(page)).toBeDisabled();
  await expect(stop(page)).toHaveText('Reset');
  expect(await exhaust(page, 'stage2.engine')).toBe(false);
});

test('switching to another tab pauses the flight', async ({ page }) => {
  await primary(page).click();
  expect((await flight(page)).playing).toBe(true);

  // Simulate the tab being hidden: the browser fires 'visibilitychange'.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect((await flight(page)).playing).toBe(false);
});
