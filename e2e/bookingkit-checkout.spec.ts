import { expect, Page, test } from '@playwright/test';
import { activate, elementState, loadWidget } from './widget-helpers';

const checkoutUrl = 'https://eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat&c=%5B%5D';
const checkoutLink = '.markdown-body a strong';
const dialogSelector = '.cl-bk-checkout-dialog';
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function loadCheckout(page: Page) {
  await loadWidget(page, {
    start_open: 'true', nitro: 'true',
    welcome_message: `[**Book tickets**](${checkoutUrl})`,
  });
  // Register after loadWidget's external-request blocker. Never contact Bookingkit.
  await page.context().route(checkoutUrl, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Synthetic checkout</title><h1>Synthetic checkout</h1>',
  }));
}

async function assertSettled(page: Page, clicks: number, opens: number) {
  await expect.poll(() => page.evaluate(() => window.__hostDiagnostics.settled)).toBe(clicks);
  const diagnostics = await page.evaluate(() => window.__hostDiagnostics);
  expect(diagnostics.cancellations).toBe(clicks);
  expect(diagnostics.opens).toBe(opens);
  expect(diagnostics.replays).toBe(0);
}

async function assertCheckoutPopup(popup: Page) {
  await expect(popup).toHaveURL(checkoutUrl);
  await expect(popup.getByRole('heading')).toHaveText('Synthetic checkout');
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  expect(await popup.evaluate(() => document.referrer)).toBe('');
}

test('Nitro checkout opens a modal and its external link opens exactly one tab', async ({ page, context, hasTouch }) => {
  await loadCheckout(page);
  await activate(page, checkoutLink, hasTouch);
  await expect.poll(() => page.evaluate((selector) => {
    const host = document.querySelector('punku-chat')!;
    return window.__widgetRoots.get(host)?.querySelector<HTMLDialogElement>(selector)?.open;
  }, dialogSelector)).toBe(true);
  await expect.poll(() => page.frames().some((frame) => frame.url() === checkoutUrl)).toBe(true);
  const frame = page.frames().find((candidate) => candidate.url() === checkoutUrl)!;
  await expect(frame.getByRole('heading')).toBeVisible();
  await expect(frame.getByRole('heading')).toHaveText('Synthetic checkout');
  await assertSettled(page, 1, 0);
  expect(context.pages()).toHaveLength(1);

  const popupPromise = context.waitForEvent('page');
  await activate(page, `${dialogSelector} a`, hasTouch);
  await assertCheckoutPopup(await popupPromise);
  await assertSettled(page, 2, 1);
  expect(context.pages()).toHaveLength(2);

  await page.bringToFront();
  await activate(page, `${dialogSelector} button`, hasTouch);
  await expect.poll(() => elementState(page, dialogSelector)).toBeNull();
  await expect.poll(async () => (await elementState(page, '.cl-chat-window'))?.visibility).toBe('visible');
  expect(context.pages()).toHaveLength(2);
});

test('Nitro checkout falls back to exactly one tab without modal support', async ({ page, context, hasTouch }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined });
  });
  await loadCheckout(page);
  const popupPromise = context.waitForEvent('page');
  await activate(page, checkoutLink, hasTouch);
  await assertCheckoutPopup(await popupPromise);
  await assertSettled(page, 1, 1);
  expect(await elementState(page, dialogSelector)).toBeNull();
  expect(context.pages()).toHaveLength(2);
});

test('modified Nitro checkout clicks keep the separate-tab behavior', async ({ page, context, hasTouch }) => {
  test.skip(hasTouch, 'Desktop modifiers run on the three desktop engines.');
  await loadCheckout(page);
  const handle = await page.evaluateHandle((selector) => {
    const host = document.querySelector('punku-chat')!;
    return window.__widgetRoots.get(host)?.querySelector(selector);
  }, checkoutLink);
  const element = handle.asElement();
  expect(element).not.toBeNull();
  const popupPromise = context.waitForEvent('page');
  try {
    await element!.click({ modifiers: ['ControlOrMeta'] });
  } finally {
    await handle.dispose();
  }
  await assertCheckoutPopup(await popupPromise);
  await assertSettled(page, 1, 1);
  expect(await elementState(page, dialogSelector)).toBeNull();
  expect(context.pages()).toHaveLength(2);
});
