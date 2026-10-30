import { expect, Page, test } from '@playwright/test';
import {
  edgeGaps, fakeKeyboard, loadWidget, partsOutsideScreen, setKeyboard, waitForInputFocus, waitForSettledBoxes,
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
