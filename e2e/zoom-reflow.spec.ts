import { expect, Page, test } from '@playwright/test';
import {
  edgeGaps, extendHostPage, fakeKeyboard, hostCorner, loadWidget, panToLayoutCorner, partsOutsideScreen, setKeyboard,
  waitForInputFocus, waitForSettledBoxes,
} from './widget-helpers';

// WCAG 1.4.10 and 2.4.7. A 1280 x 924 desktop window at 400 % zoom is 320 x
// 231 CSS px: the phone layout in a short window. The phone window kept 60 px
// (top_offset) above it and 80 px below it for the trigger, so it was about
// 91 px high, and the focused input was not on the screen. A short phone
// screen (640 x 420 px or less) gives the window the whole visible height.

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

// Tab skips a launcher with tabindex -1 (WCAG 2.4.11).
function launcherInTabOrder(page: Page) {
  return page.evaluate(() => window.__widgetRoots.get(document.querySelector('punku-chat')!)!
    .querySelector<HTMLButtonElement>('.cl-trigger')!.tabIndex >= 0);
}

// The first class of the widget part that has the keyboard focus, or null.
function focusedWidgetPart(page: Page) {
  return page.evaluate(() => {
    const active = window.__widgetRoots.get(document.querySelector('punku-chat')!)!.activeElement;
    return active?.classList[0] ?? null;
  });
}

// The visitor opens the chat from the keyboard. Focus is setup only.
async function openWithKeyboard(page: Page) {
  await page.evaluate(() => {
    window.__widgetRoots.get(document.querySelector('punku-chat')!)!.querySelector<HTMLButtonElement>('.cl-trigger')!.focus();
  });
  await page.keyboard.press('Enter');
  await waitForInputFocus(page, { fromWidget: true });
}

test.describe('400 % zoom', () => {
  test.use({ viewport: { width: 320, height: 231 } });

  test('the focused input lies inside the open window, on the screen', async ({ page }) => {
    await loadWidget(page, { show_closed_widget_hint: 'false' });
    await openWithKeyboard(page);
    await waitForSettledBoxes(page, ['.cl-chat-window', '.cl-input-element']);

    expect(await partsOutsideScreen(page, ['.cl-chat-window', '.cl-header', '.cl-close-btn', '.cl-input-element', '.cl-send-button']))
      .toEqual([]);
    const layout = await page.evaluate(() => {
      const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
      const chat = root.querySelector('.cl-chat-window')!.getBoundingClientRect();
      const input = root.querySelector('.cl-input-element')!.getBoundingClientRect();
      return {
        inputInWindow: input.top >= chat.top && input.bottom <= chat.bottom && input.left >= chat.left && input.right <= chat.right,
        inputFocused: root.activeElement === root.querySelector('.cl-input-element'),
        windowHeight: Math.round(chat.height),
        screenHeight: Math.round(window.visualViewport!.height),
      };
    });
    // The window fills the visible height and covers the trigger. Its header has a close button.
    expect(layout).toEqual({ inputInWindow: true, inputFocused: true, windowHeight: 231, screenHeight: 231 });
  });

  test('the covered launcher leaves the tab order, and takes the focus back when the chat closes', async ({ page }) => {
    await loadWidget(page, { show_closed_widget_hint: 'false' });
    await openWithKeyboard(page);
    await waitForSettledBoxes(page, ['.cl-chat-window']);

    // WCAG 2.4.11: Tab would reach a launcher that the visitor cannot see.
    await expect.poll(() => launcherInTabOrder(page)).toBe(false);
    expect(await partsOutsideScreen(page, ['.cl-close-btn'])).toEqual([]);

    await page.keyboard.press('Escape');
    await expect.poll(() => focusedWidgetPart(page)).toBe('cl-trigger');
    expect(await launcherInTabOrder(page)).toBe(true);
  });
});

// A phone turned to landscape on a page that is wider than the portrait screen
// (release test 2026-10-30, phone-320: four sites). Chromium keeps the zoom
// of such a page when the screen turns: a 371 px page on a 320 px phone shows
// 490 x 276 px of the 568 x 320 px layout viewport. The window does not follow
// the visible area while the page is zoomed in, so the short phone rule must
// not give it the whole layout height: its close X, its send button and the
// launcher went off the screen.
test.describe('a phone turned to a short landscape screen', () => {
  test.use({ viewport: { width: 320, height: 568 } });
  const wideHost = `<div style="width:371px;height:40px;background:#c8d3df"></div>${hostCorner}`;

  test('keeps the gaps of the phone layout while the page stays zoomed in', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'android', 'Chromium phone emulation keeps the zoom when the screen turns');
    await extendHostPage(page, wideHost);
    await loadWidget(page, { show_closed_widget_hint: 'false', start_open: 'true' });
    await page.setViewportSize({ width: 568, height: 320 });
    await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBeGreaterThan(1.1);
    await waitForSettledBoxes(page, ['.cl-chat-window']);

    const chatWindow = await page.evaluate(() => window.__widgetRoots.get(document.querySelector('punku-chat')!)!
      .querySelector('.cl-chat-window')!.hasAttribute('data-cl-zoomed'));
    expect(chatWindow).toBe(true);
    // top_offset above the window, and the room for the launcher below it.
    const gaps = (await edgeGaps(page, '.cl-chat-window')).layout;
    expect(gaps.top).toBe(60);
    expect(gaps.bottom).toBeGreaterThanOrEqual(80);

    // The launcher stays visible below the window, and in the tab order.
    await panToLayoutCorner(page);
    const launcherOnTop = await page.evaluate(() => {
      const host = document.querySelector('punku-chat')!;
      const trigger = window.__widgetRoots.get(host)!.querySelector('.cl-trigger')!;
      const box = trigger.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hit = window.__widgetRoots.get(host)!.elementFromPoint(x, y);
      return document.elementFromPoint(x, y) === host && !!hit && trigger.contains(hit);
    });
    expect(launcherOnTop).toBe(true);
    expect(await launcherInTabOrder(page)).toBe(true);
  });

  test('gives the window the whole height on a page that fits the landscape screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'android', 'Chromium phone emulation');
    await loadWidget(page, { show_closed_widget_hint: 'false', start_open: 'true' });
    await page.setViewportSize({ width: 568, height: 320 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(568);
    expect(await page.evaluate(() => window.visualViewport!.scale)).toBeLessThan(1.01);
    await waitForSettledBoxes(page, ['.cl-chat-window']);

    expect((await edgeGaps(page, '.cl-chat-window')).screen.top).toBe(0);
    // The full-height window covers the launcher: Tab skips it.
    await expect.poll(() => launcherInTabOrder(page)).toBe(false);
  });
});

test.describe('a short phone screen with the on-screen keyboard', () => {
  test.use({ viewport: { width: 320, height: 400 } });

  test('keeps the keyboard layout: top_offset stays above the window', async ({ page }) => {
    // The keyboard makes only the visual viewport shorter (iOS Safari, Chrome on Android 108+).
    await fakeKeyboard(page, 0);
    await loadWidget(page, { show_closed_widget_hint: 'false' });
    await openWithKeyboard(page);
    await waitForSettledBoxes(page, ['.cl-chat-window']);
    // Without the keyboard, the short screen gives the window the whole height.
    expect((await edgeGaps(page, '.cl-chat-window')).screen.top).toBe(0);

    await setKeyboard(page, 200);
    await expect.poll(async () => (await edgeGaps(page, '.cl-chat-window')).screen).toEqual({ left: 0, top: 60, right: 0, bottom: 0 });
  });
});
