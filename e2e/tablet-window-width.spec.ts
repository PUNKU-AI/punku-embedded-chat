import { expect, Page, test } from '@playwright/test';
import { loadWidget, partsOutsideScreen, waitForInputFocus, waitForSettledBoxes } from './widget-helpers';

// On screens 768-1023 px wide, the window box is at most 420 px wide. The
// inner window kept the width prop (450 px by default) as its minimum width,
// so it was wider than its box: it covered the trigger on a phone in
// landscape (844 x 390) and ran off the screen on an iPad in portrait
// (768 x 1024, 820 x 1180). The inner window must fill its box.

const parts = ['.cl-window', '.cl-close-btn', '.cl-send-button', '.cl-trigger'];
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

type Box = { left: number; top: number; right: number; bottom: number };

const overlaps = (first: Box, second: Box) =>
  first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;

async function boxes(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const box = (selector: string) => {
      const rect = root.querySelector(selector)!.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    return { frame: box('.cl-chat-window'), window: box('.cl-window'), trigger: box('.cl-trigger') };
  });
}

for (const viewport of [{ width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 820, height: 1180 }]) {
  test.describe(`${viewport.width} x ${viewport.height}`, () => {
    test.use({ viewport });

    for (const width of [undefined, '450']) {
      test(`the window fits its box, stays on the screen and off the trigger, width ${width ?? 'not set'}`, async ({ page }) => {
        // The test page sets width 300: unset it for an embed without width.
        await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', ...(width ? { width } : { unset: 'width' }) });
        await waitForInputFocus(page);
        await waitForSettledBoxes(page, parts);

        expect(await partsOutsideScreen(page, parts)).toEqual([]);
        const view = await boxes(page);
        expect(Math.round(view.window.right - view.window.left)).toBe(Math.round(view.frame.right - view.frame.left));
        expect(Math.round(view.window.right - view.window.left)).toBeLessThanOrEqual(420);
        expect(overlaps(view.window, view.trigger)).toBe(false);
      });
    }
  });
}
