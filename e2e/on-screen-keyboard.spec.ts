import { expect, Page, test } from '@playwright/test';
import {
  edgeGaps, fakeKeyboard, hostCorner, loadWidget, panToLayoutCorner, partsOutsideScreen, waitForInputFocus,
  waitForSettledBoxes, widenHostPage,
} from './widget-helpers';

// Review of #77. On iOS Safari and in Chrome on Android 108+, the on-screen
// keyboard makes only the visual viewport shorter. On a page that fits the
// screen, the closed trigger must stay behind the keyboard, as before, so it
// cannot cover a host form field. The open window, its header, close X and
// send button, and the trigger must stay inside the visible area.
// Since PR 7, a short landscape screen (641-1023 px wide, at most 500 px
// tall) hides the header while the keyboard is open: the trigger beside the
// window closes it. On a phone in portrait, the window ends at the keyboard
// and covers the trigger; its close X stays (phone-keyboard.spec.ts).

const pageErrors = new WeakMap<Page, string[]>();
// A phone keyboard covers about the lower 45 % of the screen.
const keyboardHeight = (height: number) => Math.round(height * 0.45);

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function expectOpenWindowOnScreen(page: Page, isMobile: boolean) {
  await waitForInputFocus(page);
  const { width, height } = page.viewportSize()!;
  const shortLandscape = width >= 641 && width <= 1023 && height <= 500;
  // Desktop layouts hide the close X unless show_close_button_on_desktop is set.
  const header = shortLandscape ? [] : ['.cl-header', ...(isMobile ? ['.cl-close-btn'] : [])];
  const parts = ['.cl-chat-window', '.cl-send-button', '.cl-trigger', ...header];
  await waitForSettledBoxes(page, parts);
  expect(await partsOutsideScreen(page, parts)).toEqual([]);
  if (shortLandscape) expect(await partsOutsideScreen(page, ['.cl-header'])).toEqual(['.cl-header is not shown']);
}

test('the closed trigger stays behind the keyboard on a page that fits the screen', async ({ page, viewport }) => {
  await fakeKeyboard(page, keyboardHeight(viewport!.height));
  await loadWidget(page, { show_closed_widget_hint: 'false' });
  await waitForSettledBoxes(page, ['.cl-trigger']);

  expect((await edgeGaps(page, '.cl-trigger')).layout).toMatchObject({ right: 20, bottom: 20 });
  expect(await partsOutsideScreen(page, ['.cl-trigger'])).toHaveLength(1);
});

test('the closed trigger moves above the keyboard on a page wider than the screen', async ({ page, viewport }) => {
  await fakeKeyboard(page, keyboardHeight(viewport!.height));
  await widenHostPage(page, hostCorner);
  await loadWidget(page, { show_closed_widget_hint: 'false' });

  for (const pan of [false, true]) {
    if (pan) await panToLayoutCorner(page);
    await waitForSettledBoxes(page, ['.cl-trigger']);
    expect((await edgeGaps(page, '.cl-trigger')).screen).toMatchObject({ right: 20, bottom: 20 });
  }
});

test('the open window, its controls and the trigger stay above the keyboard', async ({ page, viewport, isMobile }) => {
  await fakeKeyboard(page, keyboardHeight(viewport!.height));
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false' });
  await expectOpenWindowOnScreen(page, isMobile);
});

test.describe('Chromium phone in landscape', () => {
  // 839 x 412 is a short landscape screen (#80). Before #79, the window
  // kept its 70 % height and rose above the top of the screen with a 200 px
  // keyboard.
  test.use({ viewport: { width: 839, height: 412 } });

  test.beforeEach(({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'android', 'The android profile runs the Chromium landscape case.');
  });

  test('the open window, its controls and the trigger stay above a 200 px keyboard', async ({ page, isMobile }) => {
    await fakeKeyboard(page, 200);
    await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false' });
    await expectOpenWindowOnScreen(page, isMobile);
  });
});
