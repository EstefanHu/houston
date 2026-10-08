// The rocket fleet: the picker, ?rocket= links, and a smoke test for every rocket. The list
// of rockets comes from the picker itself, so adding a rocket adds its tests automatically.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cameraPosition, exhaust, flight, part } from './helpers';

const picker = (page: Page) => page.getByRole('combobox', { name: 'Rocket' });

async function openRocket(page: Page, id: string): Promise<void> {
  await page.goto(`/?rocket=${id}`);
  await expect(page.locator('[data-loading]')).toHaveClass(/loading--done/);
}

/** Every rocket id in the picker. */
async function rocketIds(page: Page): Promise<string[]> {
  await page.goto('/');
  return picker(page).locator('option').evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
}

test('the picker lists the fleet, Houston-1 first and selected by default', async ({ page }) => {
  const ids = await rocketIds(page);
  expect(ids[0]).toBe('houston-1');
  await expect(picker(page)).toHaveValue('houston-1');
  await expect(page).toHaveTitle('Houston · Houston-1');
});

test('an unknown ?rocket= falls back to Houston-1 and says so', async ({ page }) => {
  await openRocket(page, 'saturn-xi');
  await expect(page.getByText('There\'s no rocket called "saturn-xi"')).toBeVisible();
  await expect(picker(page)).toHaveValue('houston-1');
});

test('choosing a rocket loads it and updates the link', async ({ page }) => {
  const ids = await rocketIds(page);
  test.skip(ids.length < 2, 'only one rocket so far');
  const other = ids[1]!;
  await picker(page).selectOption(other);
  await expect(page).toHaveURL(new RegExp(`\\?rocket=${other}$`));
  await expect(picker(page)).toHaveValue(other);
});

test('every rocket loads, explodes, flies to the end and passes axe', async ({ page }) => {
  test.setTimeout(30_000 * 5);
  for (const id of await rocketIds(page)) {
    await test.step(id, async () => {
      const errors: string[] = [];
      const onError = (msg: { type(): string; text(): string }) => {
        if (msg.type() === 'error') errors.push(msg.text());
      };
      page.on('console', onError);
      await openRocket(page, id);

      // Explode and reassemble.
      const explode = page.getByRole('slider', { name: 'Explode' });
      await explode.fill('1');
      await explode.fill('0');

      // Jump to the end of the flight: the final caption shows and the clock stops.
      const end = Number(await page.getByRole('slider', { name: 'Mission time' }).getAttribute('max'));
      await page.getByRole('slider', { name: 'Mission time' }).fill(String(end));
      const { t } = await flight(page);
      expect(t).toBe(end);
      await expect(page.locator('[data-flight-event]')).not.toBeEmpty();

      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(axe.violations.map((v) => v.id), `${id} accessibility`).toEqual([]);

      page.off('console', onError);
      expect(errors, `${id} console errors`).toEqual([]);
    });
  }
});

test('the About section shows the rocket summary', async ({ page }) => {
  await openRocket(page, 'houston-1');
  await expect(page.getByRole('heading', { name: 'About Houston-1' })).toBeVisible();
  await expect(page.getByText('A simple, fictional two-stage rocket')).toBeVisible();
});

// What each real vehicle is there to teach. Scrubbing jumps straight to the moment in question.

const scrubTo = (page: Page, t: number) => page.getByRole('slider', { name: 'Mission time' }).fill(String(t));

test('Falcon 9: the booster flies back and lands on its legs, with the camera following', async ({ page }) => {
  await openRocket(page, 'falcon-9');
  const ground = await cameraPosition(page);

  await scrubTo(page, 300); // coasting high on its way back: the camera is with it
  const high = await part(page, 's1');
  expect(high.world[1]).toBeGreaterThan(100);
  await expect.poll(async () => (await cameraPosition(page))[1] - ground[1]).toBeGreaterThan(100);

  await scrubTo(page, 463); // touchdown
  expect((await part(page, 's1')).world[1]).toBeCloseTo(1.33, 2); // base raised by the deployed legs
  expect((await part(page, 's1.leg1')).rotation[2]).toBeCloseTo(-2.4, 2); // swung down and out
  await expect.poll(async () => Math.abs((await cameraPosition(page))[1] - ground[1])).toBeLessThan(20);
  expect(await exhaust(page, 's1.engines')).toBe(false); // engine off once landed
});

test('Black Brant IX: the payload goes up to apogee and comes back down', async ({ page }) => {
  await openRocket(page, 'black-brant-ix');
  await scrubTo(page, 290);
  const apogee = (await part(page, 'payload.experiment')).world[1];
  await scrubTo(page, 600);
  const falling = (await part(page, 'payload.experiment')).world[1];
  await scrubTo(page, 900);
  const landed = (await part(page, 'payload.experiment')).world[1];
  expect(apogee).toBeGreaterThan(falling);
  expect(falling).toBeGreaterThan(landed);
  expect(landed).toBeCloseTo(0, 2);
  // The parachute is packed until the end, then fully open.
  await scrubTo(page, 700);
  const packed = await page.evaluate(() => window.houstonTestHooks!.part('payload.parachute'));
  await scrubTo(page, 900);
  const open = await page.evaluate(() => window.houstonTestHooks!.part('payload.parachute'));
  expect(open.shown && packed.shown).toBe(true);
  await expect(page.locator('[data-flight-event]')).toHaveText('Touchdown');
});

test('Saturn V: the escape tower jettisons and arcs away at T+3:17', async ({ page }) => {
  await openRocket(page, 'saturn-v');
  await scrubTo(page, 196);
  const before = (await part(page, 'les')).position;
  await scrubTo(page, 210);
  const after = (await part(page, 'les')).position;
  expect(after[1] - before[1]).toBeGreaterThan(5); // pulled up and away from the stack
  await expect(page.locator('[data-flight-event]')).toHaveText('Escape tower jettison');
});

test('Falcon Heavy: side boosters separate before the centre core', async ({ page }) => {
  await openRocket(page, 'falcon-heavy');
  await scrubTo(page, 180);
  const coreAt180 = (await part(page, 'core')).position;
  expect(Math.abs((await part(page, 'left')).position[1])).toBeGreaterThan(5); // left the stack
  expect(coreAt180[1]).toBeCloseTo(0, 5);                                     // core still attached
  await scrubTo(page, 240);
  expect((await part(page, 'core')).position[1]).toBeLessThan(-5);            // now the core has gone too
});
