import { expect, Page, test } from '@playwright/test';
import {
  edgeGaps, fakeKeyboard, hostCorner, loadWidget, panToLayoutCorner, partsOutsideScreen, screenView,
  waitForInputFocus, waitForSettledBoxes, widenHostPage,
} from './widget-helpers';

// mobile_chat_window_style came from the swarovski-widget branch. It places
// and sizes the open window in the phone layout (640 px wide or less). These
// are the window styles of a live embed (no flow ID, host or texts). Its page
// hides the trigger and opens the window with its own button.
const liveEmbed = {
  mobile_chat_window_style: '{"bottom":"65px","height":"calc(98vh - 120px)"}',
  chat_window_style: '{"maxHeight":"550px"}',
  chat_trigger_style: '{"display":"none"}',
  start_open: 'true',
  show_closed_widget_hint: 'false',
  // The live embed sets no width and height.
  unset: 'width,height',
};
const { mobile_chat_window_style: _mobileStyle, ...withoutMobileStyle } = liveEmbed;
const parts = ['.cl-chat-window', '.cl-header', '.cl-close-btn', '.cl-send-button'];
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }, testInfo) => {
  // Record first: afterEach also runs for a skipped test.
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  test.skip(!['android', 'iphone'].includes(testInfo.project.name),
    'The Chromium Android and WebKit iPhone profiles run the phone window style cases.');
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function openWindow(page: Page, props: Record<string, string>) {
  await loadWidget(page, props);
  await waitForInputFocus(page);
  await waitForSettledBoxes(page, parts);
}

// The settled boxes and the styles that the browser applied.
async function windowState(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const chatWindow = root.querySelector<HTMLElement>('.cl-chat-window')!;
    const innerWindow = root.querySelector<HTMLElement>('.cl-window')!;
    const box = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    };
    const style = getComputedStyle(chatWindow);
    return {
      window: box(chatWindow),
      inner: box(innerWindow),
      applied: { bottom: style.bottom, height: style.height, width: style.width },
      innerInlineMaxHeight: innerWindow.style.maxHeight,
    };
  });
}

const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
  test.describe(`Phone in portrait, ${viewport.width} x ${viewport.height}`, () => {
    test.use({ viewport });

    test('the live phone styles place the window 65 px above the bottom, 98vh - 120 px tall', async ({ page }) => {
      await openWindow(page, liveEmbed);
      const { screen } = await screenView(page);
      const state = await windowState(page);

      // calc(98vh - 120px) of the visible height, rounded to whole px.
      // Emulated phones have no browser toolbars, so this is the
      // swarovski-widget branch box: on 390 x 844, the branch window is
      // 707.12 px tall from y 71.88, this one 707 px from y 72.
      const height = screen.height * 0.98 - 120;
      near(state.window.height, height);
      near(state.window.top, screen.height - 65 - height);
      expect((await edgeGaps(page, '.cl-chat-window')).screen.bottom).toBe(65);
      // The width keeps the phone default: the full visible width.
      near(state.window.left, 0);
      near(state.window.width, screen.width);
      expect(state.applied.bottom).toBe('65px');
      near(Number.parseFloat(state.applied.height), height);
      // Whole px: at y 69.81, Chromium showed the page through a 1 px gap above the input.
      expect([state.window.top % 1, state.window.height % 1]).toEqual([0, 0]);

      // chat_window_style stays on the window, but the phone layout fills
      // the box, as on the branch: its maxHeight of 550 px has no effect.
      expect(state.innerInlineMaxHeight).toBe('550px');
      near(state.inner.height, state.window.height);
      expect(await partsOutsideScreen(page, parts)).toEqual([]);
    });

    test('without the prop, the window keeps the phone default box', async ({ page }) => {
      await openWindow(page, withoutMobileStyle);
      const { screen } = await screenView(page);
      const state = await windowState(page);

      // top_offset (60 px) below the top, 80 px above the bottom.
      near(state.window.top, 60);
      near(state.window.height, screen.height - 140);
      near(state.window.width, screen.width);
    });

    test('the window stays above the on-screen keyboard with the live phone styles', async ({ page }) => {
      const keyboard = Math.round(viewport.height * 0.45);
      await fakeKeyboard(page, keyboard);
      await openWindow(page, liveEmbed);
      const visibleHeight = viewport.height - keyboard;
      const state = await windowState(page);

      // vh measures the visible area, so the window gets shorter. On the
      // branch, the window stayed 98vh - 120 px tall behind the keyboard.
      near(state.window.height, visibleHeight * 0.98 - 120);
      expect((await edgeGaps(page, '.cl-chat-window')).screen.bottom).toBe(65);
      expect(await partsOutsideScreen(page, parts)).toEqual([]);
    });
  });
}

test.describe('Phone in portrait on a host page wider than the screen', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the live phone styles follow the visible area when the visitor pans', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'android', 'Only Chromium phones grow the layout viewport on a wide host page.');
    await widenHostPage(page, hostCorner);
    await openWindow(page, liveEmbed);

    for (const pan of [false, true]) {
      if (pan) await panToLayoutCorner(page);
      await waitForSettledBoxes(page, parts);
      const { screen } = await screenView(page);
      const gaps = (await edgeGaps(page, '.cl-chat-window')).screen;
      expect(gaps).toMatchObject({ left: 0, right: 0, bottom: 65 });
      near((await windowState(page)).window.height, screen.height * 0.98 - 120);
      expect(await partsOutsideScreen(page, parts)).toEqual([]);
    }
  });
});

test.describe('Phone in landscape, 844 x 390', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('the phone styles do not change the landscape window, as on the branch', async ({ page }) => {
    // 844 px is wider than the 640 px phone layout.
    await openWindow(page, withoutMobileStyle);
    const without = await windowState(page);
    await openWindow(page, liveEmbed);
    const withProp = await windowState(page);

    expect(withProp.window).toEqual(without.window);
    expect(await partsOutsideScreen(page, parts)).toEqual([]);
  });
});
