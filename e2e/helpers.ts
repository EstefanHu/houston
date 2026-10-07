// Shared helpers for the browser tests.

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export type Vec3 = [number, number, number];

export const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// page.evaluate runs the function *inside the browser* and sends the result back. The function
// can't see variables from this file; anything it needs goes in through the second argument.
// window.houstonTestHooks is defined by js/main.ts in dev builds only.
const MISSING = 'window.houstonTestHooks missing: is this a dev build?';

/** Reads the 3D camera position. */
export function cameraPosition(page: Page): Promise<Vec3> {
  return page.evaluate((missing) => {
    if (!window.houstonTestHooks) throw new Error(missing);
    return window.houstonTestHooks.cameraPosition();
  }, MISSING);
}

/** Reads the explode factor from the store. */
export function explode(page: Page): Promise<number> {
  return page.evaluate((missing) => {
    if (!window.houstonTestHooks) throw new Error(missing);
    return window.houstonTestHooks.explode();
  }, MISSING);
}

/** Reads a part's local position and whether its geometry is showing in 3D. */
export function part(page: Page, id: string): Promise<{ position: Vec3; shown: boolean; highlighted: boolean }> {
  return page.evaluate(([partId, missing]) => {
    if (!window.houstonTestHooks) throw new Error(missing);
    return window.houstonTestHooks.part(partId);
  }, [id, MISSING] as const);
}

/** Reads the selected part id from the store. */
export function selected(page: Page): Promise<string | null> {
  return page.evaluate((missing) => {
    if (!window.houstonTestHooks) throw new Error(missing);
    return window.houstonTestHooks.selected();
  }, MISSING);
}

/** Reads the flight state from the store. */
export function flight(page: Page): Promise<{ t: number; phase: string; playing: boolean; speed: number }> {
  return page.evaluate((missing) => {
    if (!window.houstonTestHooks) throw new Error(missing);
    return window.houstonTestHooks.flight();
  }, MISSING);
}

/** Whether a part's engine exhaust is showing. */
export function exhaust(page: Page, id: string): Promise<boolean> {
  return page.evaluate(([partId, missing]) => {
    if (!window.houstonTestHooks) throw new Error(missing);
    return window.houstonTestHooks.exhaust(partId);
  }, [id, MISSING] as const);
}

/** Clicks a part in the 3D view, at the on-screen centre of its bounds. */
export async function clickPart(page: Page, id: string): Promise<void> {
  const { x, y } = await page.evaluate(([partId, missing]) => {
    if (!window.houstonTestHooks) throw new Error(missing);
    return window.houstonTestHooks.screenPoint(partId);
  }, [id, MISSING] as const);
  await page.mouse.click(x, y);
}

/** Opens the app and waits until the loading screen has gone, meaning the first frame is drawn. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-loading]')).toHaveClass(/loading--done/);
}

/** Drags across the middle of the 3D view, the way a user orbits the camera. */
export async function dragViewport(page: Page): Promise<void> {
  const box = await page.locator('[data-canvas-host]').boundingBox();
  if (!box) throw new Error('viewport not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 200, y - 80, { steps: 10 }); // steps: send intermediate moves, like a real drag
  await page.mouse.up();
}
