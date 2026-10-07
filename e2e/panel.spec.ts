// M5: the control panel's size: a collapsible side panel on wide screens, and a bottom sheet
// with peek / half / full heights on phones.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp, screenPoint } from './helpers';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Control panel' });
const toggle = (page: Page) => page.locator('[data-panel-toggle]');
const panelHeight = async (page: Page) => (await panel(page).boundingBox())!.height;

test.describe('wide screens', () => {
  test('the panel collapses to a rail and the 3D view takes the space', async ({ page }) => {
    await openApp(page);
    const canvas = page.locator('canvas');
    const before = (await canvas.boundingBox())!.width;

    await page.getByRole('button', { name: 'Collapse control panel' }).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('slider', { name: 'Explode' })).toBeHidden();
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(before + 200);

    await page.getByRole('button', { name: 'Expand control panel' }).click();
    await expect(page.getByRole('slider', { name: 'Explode' })).toBeVisible();
  });
});

test.describe('phones', () => {
  // test.use sets the browser window size before the page opens.
  test.use({ viewport: { width: 390, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('the panel is a bottom sheet over the 3D view, starting at peek height', async ({ page }) => {
    const box = (await panel(page).boundingBox())!;
    expect(box.y + box.height).toBeCloseTo(800, 0); // pinned to the bottom
    expect(box.width).toBeCloseTo(390, 0);
    expect(box.height).toBeCloseTo(112, 0);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('the toggle steps through peek → half → full → peek', async ({ page }) => {
    await toggle(page).click();
    await expect.poll(() => panelHeight(page)).toBeCloseTo(400, 0);
    await toggle(page).click();
    await expect.poll(() => panelHeight(page)).toBeCloseTo(800 - 44 - 16, 0);
    await expect(toggle(page)).toHaveAccessibleName('Collapse control panel');
    await toggle(page).click();
    await expect.poll(() => panelHeight(page)).toBeCloseTo(112, 0);
  });

  test('dragging the header resizes the sheet and snaps to the nearest height', async ({ page }) => {
    const header = (await page.locator('[data-panel-header]').boundingBox())!;
    const x = header.x + 60;
    const y = header.y + header.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, 150, { steps: 8 }); // most of the way up
    await page.mouse.up();
    await expect.poll(() => panelHeight(page)).toBeCloseTo(800 - 44 - 16, 0);

    const top = (await panel(page).boundingBox())!.y;
    await page.mouse.move(x, top + 20);
    await page.mouse.down();
    await page.mouse.move(x, 450, { steps: 8 }); // down to about half
    await page.mouse.up();
    await expect.poll(() => panelHeight(page)).toBeCloseTo(400, 0);
  });

  test('the 3D view shifts up to stay centred above the sheet', async ({ page }) => {
    const atPeek = await screenPoint(page, 'stage2.tanks');
    await toggle(page).click(); // half
    await expect.poll(async () => (await screenPoint(page, 'stage2.tanks')).y).toBeLessThan(atPeek.y - 50);
  });

  test('selecting a part with the sheet at full height makes room for the info card', async ({ page }) => {
    await toggle(page).click();
    await toggle(page).click(); // full
    await page.getByRole('button', { name: 'Satellite', exact: true }).click();

    await expect.poll(() => panelHeight(page)).toBeCloseTo(400, 0);
    const card = (await page.locator('[data-info-card]').boundingBox())!;
    const sheetTop = (await panel(page).boundingBox())!.y;
    expect(card.y + card.height).toBeLessThanOrEqual(sheetTop);
    expect(card.height).toBeGreaterThan(150);
  });
});
