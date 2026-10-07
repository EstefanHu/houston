// M5: automated accessibility checks with axe-core, the engine behind most accessibility
// audit tools. It catches mechanical problems (contrast, missing labels, invalid ARIA,
// landmark structure) in each main state of the app. It can't judge everything, so the
// keyboard and screen-reader behaviour is also covered by the feature tests.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp } from './helpers';

/** Runs axe on the current page and fails with a readable list of any violations. */
async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();
  const summary = results.violations.map((v) =>
    `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `  - ${n.target.join(' ')}: ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`).join('\n')}`);
  expect(summary, summary.join('\n\n')).toEqual([]);
}

test('on load', async ({ page }) => {
  await openApp(page);
  await expectNoViolations(page);
});

test('with a part selected and the timeline open', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'First-stage engine cluster', exact: true }).click();
  await page.getByText('Mission timeline').click();
  await expectNoViolations(page);
});

test('during a flight, with parts hidden', async ({ page }) => {
  await openApp(page);
  await page.getByRole('checkbox', { name: 'Show Fins' }).uncheck();
  await page.getByRole('slider', { name: 'Mission time' }).fill('205');
  await expectNoViolations(page);
});

test('with the panel collapsed', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Collapse control panel' }).click();
  await expectNoViolations(page);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('bottom sheet at half height with a part selected', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-panel-toggle]').click();
    await page.getByRole('button', { name: 'Satellite', exact: true }).click();
    await expectNoViolations(page);
  });
});

test('without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type.startsWith('webgl')) return null;
      return (original as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.getByText('3D view unavailable')).toBeVisible();
  await expectNoViolations(page);
});
