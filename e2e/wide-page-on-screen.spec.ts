import { expect, Page, test } from '@playwright/test';
import {
  activate, edgeGaps, extendHostPage, hostCorner, loadWidget, panToLayoutCorner, partsOutsideScreen, screenView,
  waitForInputFocus, waitForSettledBoxes, widenHostPage,
} from './widget-helpers';

// Issue #77, Related. A host element wider than a phone screen makes the
// layout viewport larger than the screen in Chromium. Fixed boxes placed from
// a layout viewport corner were then partly or fully outside the screen: the
// trigger, the Bookingkit checkout dialog, and the window in the 641 px and
// wider layouts. They must be placed from the visible part of the page.

const checkoutUrl = 'https://eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat&c=%5B%5D';
const dialog = '.cl-bk-checkout-dialog';
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function loadOnWidePage(page: Page, props: Record<string, string> = {}) {
  await widenHostPage(page, hostCorner);
  await loadWidget(page, { show_closed_widget_hint: 'false', ...props });
  const view = await screenView(page);
  expect(view.documentWidth).toBeGreaterThan(view.screen.width);
  return view;
}

async function gapsToScreenEdges(page: Page, selector: string) {
  return (await edgeGaps(page, selector)).screen;
}

async function overlap(page: Page, first: string, second: string) {
  return page.evaluate(([first, second]) => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const a = root.querySelector(first)!.getBoundingClientRect();
    const b = root.querySelector(second)!.getBoundingClientRect();
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  }, [first, second]);
}

const triggerPlacements: { name: string; props: Record<string, string>; gaps: Record<string, number> }[] = [
  { name: 'default corner', props: {}, gaps: { right: 20, bottom: 20 } },
  {
    name: 'bottom-left with offsets',
    props: { chat_position: 'bottom-left', left_offset: '32', bottom_offset: '40' },
    gaps: { left: 32, bottom: 40 },
  },
];

for (const { name, props, gaps } of triggerPlacements) {
  test(`the trigger keeps its offsets from the screen corner on a wide host page (${name})`, async ({ page }) => {
    await loadOnWidePage(page, props);
    await expect.poll(() => gapsToScreenEdges(page, '.cl-trigger')).toMatchObject(gaps);

    await panToLayoutCorner(page);
    await expect.poll(() => gapsToScreenEdges(page, '.cl-trigger')).toMatchObject(gaps);
  });
}

test('the trigger stays at the layout viewport corner on a page that fits the screen', async ({ page }) => {
  // A tall page gives desktop browsers a vertical scrollbar. The trigger must
  // keep its place next to it, as before the fix.
  await extendHostPage(page, '<div style="height:200vh"></div>');
  await loadWidget(page, { show_closed_widget_hint: 'false' });
  const view = await screenView(page);
  expect(Math.round(view.layout.width)).toBe(Math.round(view.screen.width));

  expect((await edgeGaps(page, '.cl-trigger')).layout).toMatchObject({ right: 20, bottom: 20 });
});

test('the closed hint shows next to the trigger on a wide host page', async ({ page }) => {
  await loadOnWidePage(page, { show_closed_widget_hint: 'true' });
  // The hint shows only while its trigger is on the screen.
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const hint = window.__widgetRoots.get(host)!.querySelector('.cl-closed-widget-hint');
    return hint ? Number(getComputedStyle(hint).opacity) : 0;
  })).toBe(1);
  await expect.poll(() => partsOutsideScreen(page, ['.cl-trigger', '.cl-closed-widget-hint'])).toEqual([]);

  await panToLayoutCorner(page);
  await expect.poll(() => partsOutsideScreen(page, ['.cl-trigger', '.cl-closed-widget-hint'])).toEqual([]);
});

test('the trigger stays on the screen next to the open window on a wide host page', async ({ page }) => {
  await loadOnWidePage(page, { start_open: 'true' });
  await waitForInputFocus(page);
  for (const pan of [false, true]) {
    if (pan) await panToLayoutCorner(page);
    await waitForSettledBoxes(page, ['.cl-chat-window', '.cl-trigger']);
    expect(await partsOutsideScreen(page, ['.cl-trigger'])).toEqual([]);
    // Below the window in most layouts. Short landscape screens can put the
    // window beside the trigger (#80), so check only that they do not overlap.
    expect(await overlap(page, '.cl-chat-window', '.cl-trigger')).toBe(false);
  }
});

test('the checkout dialog fits the screen on a wide host page', async ({ page, hasTouch }) => {
  const view = await loadOnWidePage(page, { start_open: 'true', welcome_message: `[**Book tickets**](${checkoutUrl})` });
  // Register after loadWidget's external-request blocker. Never contact Bookingkit.
  await page.context().route(checkoutUrl, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Synthetic checkout</title><h1>Synthetic checkout</h1>',
  }));
  await waitForInputFocus(page);
  await activate(page, '.markdown-body a strong', hasTouch);
  await expect.poll(() => page.evaluate((selector) => {
    const host = document.querySelector('punku-chat')!;
    return window.__widgetRoots.get(host)?.querySelector<HTMLDialogElement>(selector)?.open;
  }, dialog)).toBe(true);

  const parts = [dialog, `${dialog} button`];
  await waitForSettledBoxes(page, parts);
  expect(await partsOutsideScreen(page, parts)).toEqual([]);
  if (view.screen.width <= 767) {
    // The phone layout fills the screen.
    await expect.poll(() => gapsToScreenEdges(page, dialog)).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  } else {
    // Larger screens center the dialog.
    await expect.poll(async () => {
      const gaps = await gapsToScreenEdges(page, dialog);
      return Math.abs(gaps.left - gaps.right) <= 1 && Math.abs(gaps.top - gaps.bottom) <= 1;
    }).toBe(true);
  }

  await panToLayoutCorner(page);
  await waitForSettledBoxes(page, parts);
  expect(await partsOutsideScreen(page, parts)).toEqual([]);
});

test.describe('Chromium phone in landscape', () => {
  // 839 x 412 is a short landscape screen. The window fills the visible
  // height beside the trigger (#80). Chromium grows the layout viewport to
  // 883 x 434 on the wide page.
  test.use({ viewport: { width: 839, height: 412 } });

  test.beforeEach(({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'android', 'The android profile runs the Chromium landscape case.');
  });

  test('the open window fits the screen in the short landscape layout on a wide host page', async ({ page }) => {
    await loadOnWidePage(page, { start_open: 'true' });
    await waitForInputFocus(page);
    const parts = ['.cl-chat-window', '.cl-close-btn', '.cl-send-button', '.cl-trigger'];
    await waitForSettledBoxes(page, parts);
    expect(await partsOutsideScreen(page, parts)).toEqual([]);

    await panToLayoutCorner(page);
    await waitForSettledBoxes(page, parts);
    expect(await partsOutsideScreen(page, parts)).toEqual([]);
  });
});
