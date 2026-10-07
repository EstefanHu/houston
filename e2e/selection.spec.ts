// M3: selecting parts (in 3D or in the tree), the highlight, camera focus and the info card.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cameraPosition, clickPart, distance, dragViewport, openApp, part, selected } from './helpers';

const card = (page: Page) => page.locator('[data-info-card]');
const cardTitle = (page: Page) => page.locator('[data-info-title]');
const treeName = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('clicking a part in 3D selects, highlights and frames it', async ({ page }) => {
  const before = await cameraPosition(page);

  await clickPart(page, 'stage1.fuel');

  await expect(cardTitle(page)).toHaveText('First-stage fuel tank');
  await expect(card(page)).toContainText('Stage 1');
  await expect(card(page)).toContainText('RP-1 kerosene');
  expect(await selected(page)).toBe('stage1.fuel');
  expect((await part(page, 'stage1.fuel')).highlighted).toBe(true);
  expect((await part(page, 'stage1.lox')).highlighted).toBe(false);
  // The matching tree row is marked as current.
  await expect(treeName(page, 'First-stage fuel tank')).toHaveAttribute('aria-current', 'true');
  // The camera moves in to frame the part.
  await expect.poll(async () => distance(await cameraPosition(page), before)).toBeGreaterThan(1);
});

test('clicking empty space clears the selection', async ({ page }) => {
  await clickPart(page, 'stage2.tanks');
  await expect(cardTitle(page)).toHaveText('Second-stage tanks');

  const box = (await page.locator('[data-canvas-host]').boundingBox())!;
  await page.mouse.click(box.x + box.width - 40, box.y + 40); // top-right corner: sky only
  await expect(card(page)).toBeHidden();
  expect(await selected(page)).toBeNull();
});

test('orbiting does not change the selection', async ({ page }) => {
  await treeName(page, 'Avionics bay').click();
  await dragViewport(page);
  expect(await selected(page)).toBe('stage2.avionics');
  await expect(card(page)).toBeVisible();
});

test('selecting from the tree shows the full card; Esc and × close it', async ({ page }) => {
  await treeName(page, 'Satellite').click();
  await expect(cardTitle(page)).toHaveText('Satellite');
  await expect(card(page)).toContainText('Key specs');
  await expect(card(page)).toContainText('1,800 kg');
  await expect(card(page)).toContainText('Did you know?');

  await page.keyboard.press('Escape');
  await expect(card(page)).toBeHidden();

  await treeName(page, 'Satellite').click();
  await page.getByRole('button', { name: 'Close part info' }).click();
  await expect(card(page)).toBeHidden();
});

test('clicking the selected row again deselects it', async ({ page }) => {
  await treeName(page, 'Interstage').click();
  await treeName(page, 'Interstage').click();
  expect(await selected(page)).toBeNull();
});

test('selecting a stage highlights all of its components', async ({ page }) => {
  await treeName(page, 'Second stage').click();
  for (const id of ['stage2.engine', 'stage2.tanks', 'stage2.avionics']) {
    expect((await part(page, id)).highlighted).toBe(true);
  }
  expect((await part(page, 'stage1.fuel')).highlighted).toBe(false);
});

test('missing optional info is left out rather than shown empty', async ({ page }) => {
  // "First stage" has specs and a fun fact but no materials list.
  await treeName(page, 'First stage').click();
  await expect(card(page)).toContainText('Key specs');
  await expect(card(page)).not.toContainText('Materials');
});

test('a hidden part shows its info but the camera stays put', async ({ page }) => {
  await page.getByRole('checkbox', { name: 'Show Fins' }).uncheck();
  const before = await cameraPosition(page);

  await treeName(page, 'Fins').click();
  await expect(cardTitle(page)).toHaveText('Fins');
  await expect(card(page)).toContainText('hidden in the 3D view');

  await page.waitForTimeout(800); // longer than a camera ease
  expect(distance(await cameraPosition(page), before)).toBeLessThan(0.001);
});

test('hiding the selected part clears the selection', async ({ page }) => {
  await treeName(page, 'Satellite').click();
  await page.getByRole('checkbox', { name: 'Show Satellite' }).uncheck();
  await expect(card(page)).toBeHidden();
  expect(await selected(page)).toBeNull();
});

test('selecting in 3D expands a collapsed stage to reveal the row', async ({ page }) => {
  await page.getByRole('button', { name: 'First stage components' }).click();
  await expect(treeName(page, 'First-stage fuel tank')).toBeHidden();

  await clickPart(page, 'stage1.fuel');
  await expect(treeName(page, 'First-stage fuel tank')).toBeVisible();
  await expect(treeName(page, 'First-stage fuel tank')).toHaveAttribute('aria-current', 'true');
});
