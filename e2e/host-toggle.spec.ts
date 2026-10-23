import { expect, Page, test } from '@playwright/test';
import { extendHostPage, loadWidget } from './widget-helpers';

// Some pages hide the trigger and open and close the widget with their own
// button through the global API (Swarovski). A press outside the widget closes
// it. Before the fix, the press on such a button closed the window, and the
// click that followed opened it again. A marked button now closes the widget.

const widgetId = 'browser-fixture';
const phoneLayoutSkip = 'The phone layout fills the screen and covers the page button.';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const pageErrors: string[] = [];
  errors.set(page, pageErrors);
  page.on('pageerror', (error) => pageErrors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

const pageButton = (attribute: string) => `
  <button id="page-toggle" ${attribute}
          style="position:fixed;left:16px;bottom:16px;width:60px;height:60px;z-index:2147483647">Chat</button>`;

async function addToggleHandler(page: Page) {
  await page.evaluate((widgetId) => {
    document.getElementById('page-toggle')!.addEventListener('click', () => {
      const api = (window as any)[`${widgetId}_api`];
      if (api.isOpen()) api.close();
      else api.open();
    });
  }, widgetId);
}

const isOpen = (page: Page) => page.evaluate((widgetId) => (window as any)[`${widgetId}_api`].isOpen(), widgetId);

async function press(page: Page, hasTouch: boolean) {
  const button = page.locator('#page-toggle');
  if (hasTouch) await button.tap();
  else await button.click();
}

for (const attribute of ['data-punku-chat-toggle', 'data-punku-handler']) {
  test(`a page button marked ${attribute} opens and closes the widget`, async ({ page, hasTouch, viewport }) => {
    test.skip(viewport!.width <= 640, phoneLayoutSkip);
    await extendHostPage(page, pageButton(`${attribute}="true"`));
    await loadWidget(page);
    await addToggleHandler(page);

    await press(page, hasTouch);
    await expect.poll(() => isOpen(page)).toBe(true);

    await press(page, hasTouch);
    await expect.poll(() => isOpen(page)).toBe(false);
    // The bug opened the window again right after the press.
    await page.waitForTimeout(300);
    expect(await isOpen(page)).toBe(false);
  });
}

test('a press on an unmarked page button still closes the widget', async ({ page, hasTouch, viewport }) => {
  test.skip(viewport!.width <= 640, phoneLayoutSkip);
  await extendHostPage(page, pageButton('data-test="unmarked"'));
  await loadWidget(page);

  await page.evaluate((widgetId) => (window as any)[`${widgetId}_api`].open(), widgetId);
  await expect.poll(() => isOpen(page)).toBe(true);

  await press(page, hasTouch);
  await expect.poll(() => isOpen(page)).toBe(false);
});
