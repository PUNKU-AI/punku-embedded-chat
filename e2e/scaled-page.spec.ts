import { expect, Page, test } from '@playwright/test';
import {
  activate, elementState, fakeKeyboard, loadWidget, partsOutsideScreen, scaleHostPage, waitForInputFocus,
  waitForSettledBoxes,
} from './widget-helpers';

// Issue #82. Wix sites set <meta name="viewport" content="width=320">. The
// browser scales the page up to the screen: 2.3 on a 740 x 360 phone in
// landscape, where the page is then 320 x 156 CSS px. The phone window took
// the top offset and the trigger gap from those 156 px and became a 16 px
// strip. The widget now lays out at the screen size on such pages: one
// widget px is one screen px. The offsets stay in page px, because host
// elements that they clear, such as a booking button, scale with the page.

const openParts = ['.cl-chat-window', '.cl-header', '.cl-close-btn', '.cl-input-element', '.cl-send-button', '.cl-trigger'];
const screens = [
  { width: 740, height: 360 },
  { width: 844, height: 390 },
  { width: 390, height: 844 },
];
// Header, one message line and input.
const minimumWindowHeight = 240;
const pageErrors = new WeakMap<Page, string[]>();

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

test.beforeEach(({ page }, testInfo) => {
  // Record first: afterEach also runs for a skipped test.
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  test.skip(!['android', 'iphone'].includes(testInfo.project.name),
    'The Chromium Android and WebKit iPhone profiles run the scaled page cases.');
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

// Boxes in screen px from the top-left corner of the visible area.
async function screenBoxes(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const viewport = window.visualViewport!;
    const box = (selector: string) => {
      const rect = root.querySelector(selector)!.getBoundingClientRect();
      const left = (rect.left - viewport.offsetLeft) * viewport.scale;
      const top = (rect.top - viewport.offsetTop) * viewport.scale;
      const width = rect.width * viewport.scale;
      const height = rect.height * viewport.scale;
      return { left, top, right: left + width, bottom: top + height, width, height };
    };
    return {
      scale: viewport.scale,
      screen: { width: viewport.width * viewport.scale, height: viewport.height * viewport.scale },
      window: box('.cl-chat-window'),
      messages: box('.cl-messages_container'),
      lastMessage: box('.cl-bot_message'),
      trigger: box('.cl-trigger'),
    };
  });
}

function overlaps(first: Box, second: Box) {
  return first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;
}

/*
 * Tap a widget element. First check that a tap at its center reaches it,
 * through the widget root that covers the screen. Playwright WebKit maps
 * touch points wrongly on a scaled page, also on main: its tap lands on the
 * host page. There, activate the element by script.
 */
async function tapWidget(page: Page, selector: string, hasTouch: boolean, browserName: string) {
  expect(await page.evaluate((selector) => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const element = root.querySelector(selector)!;
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const target = root.elementFromPoint(x, y);
    return document.elementFromPoint(x, y) === host && !!target && (target === element || element.contains(target));
  }, selector)).toBe(true);
  if (browserName !== 'webkit') {
    await activate(page, selector, hasTouch);
    return;
  }
  await page.evaluate((selector) => {
    const host = document.querySelector('punku-chat')!;
    window.__widgetRoots.get(host)!.querySelector<HTMLElement>(selector)!.click();
  }, selector);
}

async function openWindow(page: Page, props: Record<string, string> = {}) {
  await scaleHostPage(page);
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', ...props });
  await waitForInputFocus(page);
  await waitForSettledBoxes(page, openParts);
}

async function expectUsableWindow(page: Page, bottomOffset = 20) {
  expect(await partsOutsideScreen(page, openParts)).toEqual([]);
  const view = await screenBoxes(page);
  // The page is scaled, and the widget is not: the trigger keeps its 48 px.
  expect(view.scale).toBeGreaterThan(1.1);
  expect(Math.round(view.trigger.width)).toBe(48);
  // The offsets are page px: right_offset 20 and bottom_offset from the screen corner.
  const pagePx = (value: number) => Math.round(value * view.scale);
  expect(Math.round(view.screen.width - view.trigger.right)).toBe(pagePx(20));
  expect(Math.round(view.screen.height - view.trigger.bottom)).toBe(pagePx(bottomOffset));
  // The latest message is fully visible in the message list.
  expect(view.lastMessage.top).toBeGreaterThanOrEqual(view.messages.top - 0.5);
  expect(view.lastMessage.bottom).toBeLessThanOrEqual(view.messages.bottom + 0.5);

  if (view.screen.width > view.screen.height) {
    // The short landscape layout of a 740 or 844 px screen (#77): the full
    // height beside the trigger, 8 px from the top. The bottom is level with
    // the trigger bottom while the window keeps 240 px. Else the window
    // keeps 240 px and ends lower.
    expect(overlaps(view.window, view.trigger)).toBe(false);
    expect(Math.round(view.trigger.left - view.window.right)).toBe(12);
    expect(Math.round(view.window.top)).toBe(8);
    if (view.screen.height - 8 - pagePx(bottomOffset) >= minimumWindowHeight) {
      expect(Math.round(view.trigger.bottom)).toBe(Math.round(view.window.bottom));
    } else {
      expect(Math.round(view.window.height)).toBe(minimumWindowHeight);
    }
  } else {
    // The phone layout: the full width, below the top offset (60 page px) and above the trigger gap.
    expect(Math.round(view.window.left)).toBe(0);
    expect(Math.round(view.window.width)).toBe(Math.round(view.screen.width));
    expect(Math.round(view.window.top)).toBe(pagePx(60));
    expect(Math.round(view.screen.height - view.window.bottom)).toBe(80);
  }
  return view;
}

for (const viewport of screens) {
  test.describe(`width=320 page on a ${viewport.width} x ${viewport.height} screen`, () => {
    test.use({ viewport });

    test('the open window shows the header, the close X, the latest message and the input', async ({ page }) => {
      await openWindow(page);
      await expectUsableWindow(page);
    });

    test('the window, its controls and the trigger stay above the on-screen keyboard', async ({ page }) => {
      // fakeKeyboard takes CSS px of the page. Cover 45 % of the screen.
      await fakeKeyboard(page, Math.round((viewport.height * 320 / viewport.width) * 0.45));
      await openWindow(page);
      expect(await partsOutsideScreen(page, openParts)).toEqual([]);
    });

    test('the closed trigger stays behind the on-screen keyboard', async ({ page }) => {
      // As on other pages, the closed trigger cannot cover a host form field above the keyboard.
      await fakeKeyboard(page, Math.round((viewport.height * 320 / viewport.width) * 0.45));
      await scaleHostPage(page);
      await loadWidget(page, { show_closed_widget_hint: 'false' });
      await waitForSettledBoxes(page, ['.cl-trigger']);
      expect(await partsOutsideScreen(page, ['.cl-trigger'])).toHaveLength(1);
    });

    test('the closed hint is beside the trigger at screen size', async ({ page }) => {
      await scaleHostPage(page);
      await loadWidget(page, { closed_widget_hint_position: 'left' });
      await expect.poll(async () => (await elementState(page, '.cl-closed-widget-hint'))?.opacity).toBe(1);
      await waitForSettledBoxes(page, ['.cl-trigger', '.cl-closed-widget-hint']);
      expect(await partsOutsideScreen(page, ['.cl-trigger', '.cl-closed-widget-hint'])).toEqual([]);

      const { trigger, scale } = await screenBoxes(page);
      const hint = (await elementState(page, '.cl-closed-widget-hint'))!;
      // 12 px between the hint and the trigger, and one line of 14 px text.
      expect(Math.round(trigger.left - hint.right * scale)).toBe(12);
      expect(hint.height * scale).toBeLessThan(48);
    });
  });
}

test.describe('width=320 page on a 740 x 360 screen', () => {
  test.use({ viewport: { width: 740, height: 360 } });

  test('bottom_offset 80 keeps the trigger 80 page px above the bottom, and the window keeps 240 px', async ({ page }) => {
    // A live Wix embed uses 80 to clear the site's own booking button, which scales with the page.
    await openWindow(page, { bottom_offset: '80' });
    const view = await expectUsableWindow(page, 80);
    expect(Math.round(view.screen.height - view.trigger.bottom)).toBe(185);
  });

  test('the trigger opens the window, the input takes text and the close X closes it', async ({ page, hasTouch, browserName }) => {
    await scaleHostPage(page);
    await loadWidget(page, { show_closed_widget_hint: 'false' });
    // The widget root covers the screen while it undoes the page scale. Taps
    // outside the widget must still reach the host page.
    const hitOutside = () => page.evaluate(() => document.elementFromPoint(40, 40)?.closest('punku-chat') === null);
    expect(await hitOutside()).toBe(true);

    await tapWidget(page, '.cl-trigger', hasTouch, browserName);
    await waitForInputFocus(page);
    await waitForSettledBoxes(page, openParts);
    await expectUsableWindow(page);
    await page.keyboard.type('Hello');
    expect(await page.evaluate(() => {
      const host = document.querySelector('punku-chat')!;
      return window.__widgetRoots.get(host)!.querySelector<HTMLTextAreaElement>('.cl-input-element')!.value;
    })).toBe('Hello');
    expect(await hitOutside()).toBe(true);

    await tapWidget(page, '.cl-close-btn', hasTouch, browserName);
    // Closed: scaled to zero, or hidden after the close fade of #86.
    await expect.poll(async () => {
      const closed = await elementState(page, '.cl-chat-window');
      return !closed || closed.width === 0 || closed.visibility === 'hidden';
    }).toBe(true);
  });

  test('the checkout dialog opens and its close button closes it', async ({ page, hasTouch, browserName }) => {
    const checkoutUrl = 'https://eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat&c=%5B%5D';
    await openWindow(page, { welcome_message: `[**Book tickets**](${checkoutUrl})` });
    // Register after loadWidget's external-request blocker. Never contact Bookingkit.
    await page.context().route(checkoutUrl, (route) => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Synthetic checkout</title><h1>Synthetic checkout</h1>',
    }));
    const dialogOpen = () => page.evaluate(() => {
      const host = document.querySelector('punku-chat')!;
      return !!window.__widgetRoots.get(host)?.querySelector<HTMLDialogElement>('.cl-bk-checkout-dialog')?.open;
    });

    await tapWidget(page, '.markdown-body a strong', hasTouch, browserName);
    await expect.poll(dialogOpen).toBe(true);
    expect(await partsOutsideScreen(page, ['.cl-bk-checkout-dialog', '.cl-bk-checkout-dialog button'])).toEqual([]);
    // The dialog undoes the page scale too: it fills the screen, and its close button keeps its 40 px.
    const checkout = await page.evaluate(() => {
      const host = document.querySelector('punku-chat')!;
      const root = window.__widgetRoots.get(host)!;
      const scale = window.visualViewport!.scale;
      const dialog = root.querySelector('.cl-bk-checkout-dialog')!.getBoundingClientRect();
      const button = root.querySelector('.cl-bk-checkout-dialog button')!.getBoundingClientRect();
      return { width: dialog.width * scale, height: dialog.height * scale, button: button.width * scale };
    });
    expect(Math.round(checkout.width)).toBe(740);
    // The layout viewport is 155 or 156 CSS px tall: 358 or 360 screen px.
    expect(Math.round(checkout.height)).toBeGreaterThanOrEqual(355);
    expect(Math.round(checkout.button)).toBe(40);
    await tapWidget(page, '.cl-bk-checkout-dialog button', hasTouch, browserName);
    await expect.poll(dialogOpen).toBe(false);
  });
});

test.describe('width=320 page, rotation', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the open window fits the screen after each rotation', async ({ page }, testInfo) => {
    // WebKit mobile pages on Linux do not lay out again after setViewportSize.
    test.skip(testInfo.project.name !== 'android', 'The Chromium Android profile runs the rotation case.');
    await openWindow(page);
    await expectUsableWindow(page);

    for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.evaluate(() => Math.round(window.visualViewport!.width * window.visualViewport!.scale)))
        .toBe(viewport.width);
      await waitForSettledBoxes(page, openParts);
      await expectUsableWindow(page);
    }
  });
});
