import { expect, Page, test } from '@playwright/test';
import {
  hostCorner, loadWidget, panToLayoutCorner, partsOutsideScreen, screenView, waitForInputFocus, widenHostPage,
} from './widget-helpers';

// Issue #77. A host element wider than a phone screen makes the layout
// viewport larger than the screen. The phone window is a fixed box, so it
// grew with the layout viewport, and its close and send buttons were cut off.
// The open window must fit the visible part of the page (the visual viewport).

const widgetId = 'browser-fixture';
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }, testInfo) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  // Short landscape phones use the 641-767 px layout. Its window rises above
  // the top of the screen on every page, wide or not (#77, Related).
  test.skip(testInfo.project.name === 'phone-landscape', 'The landscape layout overflows on every page (#77, Related).');
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function openOnWidePage(page: Page, props: Record<string, string> = {}) {
  await widenHostPage(page, hostCorner);
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', ...props });
  await waitForInputFocus(page);
  const view = await screenView(page);
  expect(view.documentWidth).toBeGreaterThan(view.screen.width);
  return view;
}

async function expectWindowOnScreen(page: Page, isMobile: boolean) {
  // Desktop layouts hide the close X unless show_close_button_on_desktop is set.
  const parts = ['.cl-chat-window', '.cl-send-button', ...(isMobile ? ['.cl-close-btn'] : [])];
  await expect.poll(() => partsOutsideScreen(page, parts)).toEqual([]);
}

async function chatWindowBox(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const box = window.__widgetRoots.get(host)!.querySelector('.cl-chat-window')!.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width };
  });
}

test('the open window fits the screen on a host page wider than the screen', async ({ page, isMobile }) => {
  const view = await openOnWidePage(page);
  await expectWindowOnScreen(page, isMobile);

  if (view.screen.width <= 640) {
    // The phone layout fills the screen width.
    await expect.poll(async () => Math.round((await chatWindowBox(page)).width)).toBe(Math.round(view.screen.width));
  }
});

test('the open window follows the screen when the visitor pans a wide host page', async ({ page, isMobile }) => {
  await openOnWidePage(page);
  await panToLayoutCorner(page);
  await expectWindowOnScreen(page, isMobile);
});

test('top_offset keeps its distance from the top of the screen on a wide host page', async ({ page, isMobile }) => {
  const view = await openOnWidePage(page, { top_offset: '100' });
  test.skip(view.screen.width > 640, 'top_offset places the window only in the phone layout.');

  await expect.poll(async () => Math.round((await chatWindowBox(page)).top)).toBe(100);
  const panned = await panToLayoutCorner(page);
  await expect.poll(async () => Math.round((await chatWindowBox(page)).top - panned.screen.top)).toBe(100);
  await expectWindowOnScreen(page, isMobile);
});

test('the open window fits the screen after setTriggerPosition on a wide host page', async ({ page, isMobile }) => {
  const view = await openOnWidePage(page);
  // Anchor the trigger inside the visible area, near its top-left corner.
  expect(await page.evaluate((widgetId) => {
    const api = (window as unknown as Record<string, { setTriggerPosition(position: unknown): boolean }>)[`${widgetId}_api`];
    return api.setTriggerPosition({ x: 24, y: 120 });
  }, widgetId)).toBe(true);
  await expectWindowOnScreen(page, isMobile);

  if (view.screen.width <= 640) {
    await panToLayoutCorner(page);
    await expectWindowOnScreen(page, isMobile);
  }
});
