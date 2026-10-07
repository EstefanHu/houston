// M2: the explode slider and the parts tree, checked through both the panel (what the user
// sees) and the 3D scene (via the test hooks).

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { explode, openApp, part } from './helpers';

// Assembled y-positions and explode offsets come from js/scene/placeholderRocket.ts and
// js/data/rocket.json: stage 1 moves down 6, the payload section moves up 5.
const STAGE1_Y = 0;
const PAYLOAD_Y = 11;

const slider = (page: Page) => page.getByRole('slider', { name: 'Explode' });
const partRow = (page: Page, name: string) => page.getByRole('checkbox', { name: `Show ${name}`, exact: true });

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test.describe('explode', () => {
  test('the slider spreads the stages apart and Reset brings them back', async ({ page }) => {
    // fill() on a range input sets its value and fires the same events as a user drag.
    await slider(page).fill('1');
    await expect(page.locator('[data-explode-value]')).toHaveText('100%');

    // The motion eases in, so poll until the parts arrive.
    await expect.poll(async () => (await part(page, 'stage1')).position[1]).toBeCloseTo(STAGE1_Y - 6, 2);
    await expect.poll(async () => (await part(page, 'payload')).position[1]).toBeCloseTo(PAYLOAD_Y + 5, 2);

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(slider(page)).toHaveValue('0');
    await expect.poll(async () => (await part(page, 'payload')).position[1]).toBeCloseTo(PAYLOAD_Y, 2);
    // Nothing left to reset.
    await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled();
  });

  test('works from the keyboard', async ({ page }) => {
    await slider(page).focus();
    await page.keyboard.press('End');
    expect(await explode(page)).toBe(1);
    await page.keyboard.press('ArrowLeft');
    expect(await explode(page)).toBeCloseTo(0.99);
    await expect(slider(page)).toHaveAttribute('aria-valuetext', '99% separated');
  });

  test.describe('with reduced motion', () => {
    // test.use sets browser options before the page opens, so the app sees "reduce" from the
    // start. (Switching it on after load would race the app's media-query listener.)
    test.use({ reducedMotion: 'reduce' });

    test('parts jump straight to position', async ({ page }) => {
      await slider(page).fill('1');
      // No polling: the position must already be final.
      expect((await part(page, 'payload')).position[1]).toBeCloseTo(PAYLOAD_Y + 5, 5);
    });
  });

  test('hidden parts keep moving, so they reappear in the right place', async ({ page }) => {
    await partRow(page, 'Payload section').uncheck();
    await slider(page).fill('1');
    await expect.poll(async () => (await part(page, 'payload')).position[1]).toBeCloseTo(PAYLOAD_Y + 5, 2);
    expect((await part(page, 'payload')).shown).toBe(false);
  });
});

test.describe('parts tree', () => {
  test('unticking a stage hides its components; showing one makes the stage mixed', async ({ page }) => {
    await partRow(page, 'Payload section').uncheck();

    for (const name of ['Fairing (left half)', 'Fairing (right half)', 'Satellite']) {
      await expect(partRow(page, name)).not.toBeChecked();
    }
    expect((await part(page, 'payload.satellite')).shown).toBe(false);
    expect((await part(page, 'stage2.tanks')).shown).toBe(true); // other stages untouched

    await partRow(page, 'Satellite').check();
    expect((await part(page, 'payload.satellite')).shown).toBe(true);
    // A partly hidden stage shows an indeterminate ("mixed") checkbox.
    await expect(partRow(page, 'Payload section')).toHaveJSProperty('indeterminate', true);
  });

  test('isolate shows only that part; isolating it again restores the previous view', async ({ page }) => {
    await partRow(page, 'Fins').uncheck();

    const isolate = page.getByRole('button', { name: 'Isolate Second stage' });
    await isolate.click();
    await expect(isolate).toHaveAttribute('aria-pressed', 'true');
    expect((await part(page, 'stage2.engine')).shown).toBe(true);
    expect((await part(page, 'stage1.engines')).shown).toBe(false);
    expect((await part(page, 'payload.satellite')).shown).toBe(false);

    await isolate.click();
    await expect(isolate).toHaveAttribute('aria-pressed', 'false');
    // Back to before: only the fins are hidden.
    await expect(partRow(page, 'Fins')).not.toBeChecked();
    expect((await part(page, 'stage1.fins')).shown).toBe(false);
    expect((await part(page, 'stage1.engines')).shown).toBe(true);
    expect((await part(page, 'payload.satellite')).shown).toBe(true);
  });

  test('Show all brings everything back', async ({ page }) => {
    const showAll = page.getByRole('button', { name: 'Show all' });
    await expect(showAll).toBeDisabled();

    await page.getByRole('button', { name: 'Isolate Satellite' }).click();
    await expect(showAll).toBeEnabled();
    await showAll.click();

    await expect(page.getByRole('checkbox', { checked: false })).toHaveCount(0);
    expect((await part(page, 'stage1.engines')).shown).toBe(true);
    await expect(showAll).toBeDisabled();
  });

  test('stages collapse and expand', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'First stage components' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(partRow(page, 'Fins')).toBeHidden();
    await toggle.click();
    await expect(partRow(page, 'Fins')).toBeVisible();
  });
});
