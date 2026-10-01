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

async function loadCheckout(page: Page, nitro = true) {
  await loadWidget(page, {
    start_open: 'true', nitro: String(nitro),
    welcome_message: `[**Book tickets**](${checkoutUrl})`,
  });
  // Register after loadWidget's external-request blocker. Never contact Bookingkit.
  await page.context().route(checkoutUrl, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Synthetic checkout</title><h1>Synthetic checkout</h1>',
  }));
}

async function waitForCheckout(page: Page) {
  await expect.poll(() => page.evaluate((selector) => {
    const host = document.querySelector('punku-chat')!;
    return window.__widgetRoots.get(host)?.querySelector<HTMLDialogElement>(selector)?.open;
  }, dialogSelector)).toBe(true);
  await expect.poll(() => page.frames().some((frame) => frame.url() === checkoutUrl)).toBe(true);
  const frame = page.frames().find((candidate) => candidate.url() === checkoutUrl)!;
  await expect(frame.getByRole('heading')).toBeVisible();
  await expect(frame.getByRole('heading')).toHaveText('Synthetic checkout');
  return frame;
}

async function assertCheckoutLinkFocused(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const anchor = root.querySelector<HTMLAnchorElement>('.markdown-body a');
    return root.activeElement === anchor ? { text: anchor?.textContent, href: anchor?.href } : null;
  })).toEqual({ text: 'Book tickets', href: checkoutUrl });
}

async function waitForInputFocus(page: Page) {
  // Wait for the initial input-focus timer before establishing the opener.
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    return window.__widgetRoots.get(host)?.activeElement?.classList.contains('cl-input-element');
  })).toBe(true);
}

async function focusCheckoutLink(page: Page) {
  await waitForInputFocus(page);
  // Focus is setup only. Real keyboard or pointer input opens checkout.
  await page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    window.__widgetRoots.get(host)?.querySelector<HTMLAnchorElement>('.markdown-body a')?.focus();
  });
  await assertCheckoutLinkFocused(page);
}

async function assertCheckoutClosed(page: Page) {
  await expect.poll(() => elementState(page, dialogSelector)).toBeNull();
  await expect.poll(async () => (await elementState(page, '.cl-chat-window'))?.visibility).toBe('visible');
  await assertCheckoutLinkFocused(page);
}

async function assertNoPopup(page: Page, clicks: number) {
  await expect.poll(() => page.evaluate(() => window.__hostDiagnostics.settled)).toBe(clicks);
  expect(await page.evaluate(() => window.__hostDiagnostics.opens)).toBe(0);
  expect(page.context().pages()).toHaveLength(1);
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
  await waitForCheckout(page);
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

for (const nitro of [false, true]) {
  test(`checkout restores keyboard focus after Escape (Nitro ${nitro})`, async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'Keyboard input runs on the three desktop engines.');
    await loadCheckout(page, nitro);
    await focusCheckoutLink(page);
    await page.keyboard.press('Enter');
    await waitForCheckout(page);
    await assertSettled(page, nitro ? 1 : 0, 0);
    await expect.poll(() => page.evaluate(() => {
      const host = document.querySelector('punku-chat')!;
      return window.__widgetRoots.get(host)?.activeElement?.matches('.cl-bk-checkout-dialog button');
    })).toBe(true);

    await page.keyboard.press('Escape');
    await assertCheckoutClosed(page);
    await assertNoPopup(page, nitro ? 1 : 0);

    // Do not refocus the link. Enter must use the restored keyboard focus.
    await page.keyboard.press('Enter');
    await waitForCheckout(page);
    await assertSettled(page, nitro ? 2 : 0, 0);
    await assertNoPopup(page, nitro ? 2 : 0);
    await page.keyboard.press('Escape');
    await assertCheckoutClosed(page);
  });

  test(`checkout restores opener focus after button and frame closure (Nitro ${nitro})`, async ({ page, hasTouch }) => {
    await loadCheckout(page, nitro);
    // Start from the input. Pointer activation must record the actual opener.
    await waitForInputFocus(page);
    await activate(page, checkoutLink, hasTouch);
    await waitForCheckout(page);
    await assertSettled(page, nitro ? 1 : 0, 0);

    await activate(page, `${dialogSelector} button`, hasTouch);
    await assertCheckoutClosed(page);
    await assertNoPopup(page, nitro ? 2 : 0);

    await activate(page, checkoutLink, hasTouch);
    const frame = await waitForCheckout(page);
    await assertNoPopup(page, nitro ? 3 : 0);
    await frame.evaluate(() => window.parent.postMessage({ action: 'closeLightbox' }, 'http://127.0.0.1:4179'));
    await assertCheckoutClosed(page);
    await assertNoPopup(page, nitro ? 3 : 0);
  });
}

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
