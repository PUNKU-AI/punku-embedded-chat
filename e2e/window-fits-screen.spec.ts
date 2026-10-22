import { expect, Page, test } from '@playwright/test';
import { loadWidget, waitForInputFocus, widenHostPage } from './widget-helpers';

// Issue #77. A host element wider than a phone screen makes the layout
// viewport larger than the screen. The phone window is a fixed box, so it
// grew with the layout viewport, and its close and send buttons were cut off.
// The open window must fit the visible part of the page (the visual viewport).

const widgetId = 'browser-fixture';
// Host marker in the bottom-right corner of the layout viewport. The tests
// scroll it into view to pan the visible area, as a visitor can.
const corner = '<div id="host-corner" style="position:fixed;right:0;bottom:0;width:1px;height:1px"></div>';
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
  await widenHostPage(page, corner);
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', ...props });
  await waitForInputFocus(page);
  const view = await screenView(page);
  expect(view.documentWidth).toBeGreaterThan(view.screen.width);
  return view;
}

async function screenView(page: Page) {
  return page.evaluate(() => {
    const viewport = window.visualViewport!;
    // A fixed box with inset 0 shows the layout viewport, which the chat
    // window followed before the fix.
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none';
    document.body.append(probe);
    const layout = probe.getBoundingClientRect();
    probe.remove();
    return {
      documentWidth: document.documentElement.scrollWidth,
      layout: { width: layout.width, height: layout.height },
      screen: { left: viewport.offsetLeft, top: viewport.offsetTop, width: viewport.width, height: viewport.height },
    };
  });
}

async function partsOutsideScreen(page: Page, selectors: string[]) {
  // Client coordinates and the visual viewport offsets both start at the
  // layout viewport. Allow half a pixel for rounding.
  return page.evaluate((selectors) => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const viewport = window.visualViewport!;
    const left = viewport.offsetLeft;
    const top = viewport.offsetTop;
    const right = left + viewport.width;
    const bottom = top + viewport.height;
    const round = (value: number) => Math.round(value);
    return selectors.flatMap((selector) => {
      const element = root.querySelector<HTMLElement>(selector);
      const box = element?.getBoundingClientRect();
      if (!element || !box || box.width === 0 || box.height === 0) return [`${selector} is not shown`];
      if (box.left >= left - 0.5 && box.top >= top - 0.5 && box.right <= right + 0.5 && box.bottom <= bottom + 0.5) return [];
      return [`${selector} x ${round(box.left)}-${round(box.right)}, y ${round(box.top)}-${round(box.bottom)}; ` +
        `screen x ${round(left)}-${round(right)}, y ${round(top)}-${round(bottom)}`];
    });
  }, selectors);
}

async function windowMoving(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    return window.__widgetRoots.get(host)!.querySelector('.cl-chat-window')!.getAnimations().length > 0;
  });
}

async function expectWindowOnScreen(page: Page, isMobile: boolean) {
  // Desktop layouts hide the close X unless show_close_button_on_desktop is set.
  const parts = ['.cl-chat-window', '.cl-send-button', ...(isMobile ? ['.cl-close-btn'] : [])];
  // The window can animate its scale, place and size for 300 ms. Check only
  // the settled box, so a window that crosses the screen on its way cannot pass.
  await expect.poll(async () => (await windowMoving(page))
    ? ['.cl-chat-window is moving']
    : partsOutsideScreen(page, parts)).toEqual([]);
}

async function chatWindowBox(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const box = window.__widgetRoots.get(host)!.querySelector('.cl-chat-window')!.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width };
  });
}

async function panToLayoutCorner(page: Page) {
  await page.evaluate(() => document.getElementById('host-corner')!.scrollIntoView({ block: 'end', inline: 'end' }));
  const view = await screenView(page);
  // Chromium phones make the layout viewport larger than the screen, so the
  // visible area moves inside it. Elsewhere the two are the same size.
  if (view.layout.width > view.screen.width + 1) {
    await expect.poll(async () => (await screenView(page)).screen.left).toBeGreaterThan(0);
  }
  return screenView(page);
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
  const position = { x: 24, y: 120 };
  expect(await page.evaluate(({ widgetId, position }) => {
    const api = (window as unknown as Record<string, { setTriggerPosition(position: unknown): boolean }>)[`${widgetId}_api`];
    return api.setTriggerPosition(position);
  }, { widgetId, position })).toBe(true);
  // React moves the trigger and the window in a later render. Until then, the
  // window is still at its old place. Check it only after the trigger moved.
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const box = window.__widgetRoots.get(host)!.querySelector('.cl-trigger')!.getBoundingClientRect();
    return { x: Math.round(box.left), y: Math.round(box.top) };
  })).toEqual(position);
  await expectWindowOnScreen(page, isMobile);

  if (view.screen.width <= 640) {
    await panToLayoutCorner(page);
    await expectWindowOnScreen(page, isMobile);
  }
});
