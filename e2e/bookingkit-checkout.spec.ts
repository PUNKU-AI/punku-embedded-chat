import { expect, Page, test } from '@playwright/test';
import { activate, elementState, loadWidget, waitForInputFocus } from './widget-helpers';

const checkoutUrl = 'https://eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat&c=%5B%5D';
// The agent writes the bold outside the link: p > strong > a. Older tests used
// [**Book tickets**](url), which hid that real answers showed no button.
const agentFormat = `**[Book tickets](${checkoutUrl})**`;
const boldInsideLink = `[**Book tickets**](${checkoutUrl})`;
const checkoutLink = '.markdown-body a';
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

async function loadCheckout(page: Page, nitro = true, message = agentFormat, props: Record<string, string> = {}) {
  await loadWidget(page, {
    start_open: 'true', nitro: String(nitro),
    welcome_message: message,
    ...props,
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

async function assertFilledButton(page: Page) {
  expect(await page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const anchor = window.__widgetRoots.get(host)!.querySelector<HTMLAnchorElement>('.markdown-body a')!;
    const style = getComputedStyle(anchor);
    return { linkOnly: !!anchor.closest('p.cl-link-only'), display: style.display, filled: style.backgroundColor !== 'rgba(0, 0, 0, 0)' };
  })).toEqual({ linkOnly: true, display: 'inline-flex', filled: true });
}

async function assertCheckoutLinkFocused(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const anchor = root.querySelector<HTMLAnchorElement>('.markdown-body a');
    return root.activeElement === anchor ? { text: anchor?.textContent, href: anchor?.href } : null;
  })).toEqual({ text: 'Book tickets', href: checkoutUrl });
}

async function focusCheckoutLink(page: Page) {
  // Wait for the initial input-focus timer before establishing the opener.
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
  await assertFilledButton(page);
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

test('a link with the bold inside is still a filled button that opens checkout', async ({ page, hasTouch }) => {
  await loadCheckout(page, true, boldInsideLink);
  await assertFilledButton(page);
  await waitForInputFocus(page);
  await activate(page, '.markdown-body a strong', hasTouch);
  await waitForCheckout(page);
  await assertSettled(page, 1, 0);
  await activate(page, `${dialogSelector} button`, hasTouch);
  await assertCheckoutClosed(page);
  await assertNoPopup(page, 2);
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

// The server sends the facts of a verified checkout link as a JSON content
// block of the agent message (checkoutCards.ts): when the checkout tool ends,
// before any text, and again with the text. The answer then shows a checkout
// card. Made-up experience and venue.
const blocksFor = (product: string) => [{
  title: 'Checkout',
  contents: [{
    type: 'json',
    data: {
      kind: 'punku.checkout_card', v: 1, url: checkoutUrl, locale: 'de',
      bookings: [{ count: 2, unit: 'person', product }],
    },
  }],
}];
const cardAnswer = `Am Samstag um 18:00 Uhr sind noch Plätze frei.\n\n👉 **[Jetzt Tickets sichern](${checkoutUrl})**`;
const cardButton = '.cl-checkout-card-button';

async function loadCardAnswer(page: Page, nitro: boolean, {
  product = 'Nachtführung in der Alten Mühle', venue = 'Burg Beispielstein', check = true,
}: { product?: string; venue?: string; check?: boolean } = {}) {
  const cardBlocks = blocksFor(product);
  await page.route('**/api/v1/run/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/x-ndjson',
    body: [
      { event: 'add_message', data: { sender: 'Machine', id: 'synthetic-card', text: '', content_blocks: cardBlocks } },
      { event: 'add_message', data: { sender: 'Machine', id: 'synthetic-card', text: cardAnswer.split('\n\n')[0], content_blocks: cardBlocks } },
      { event: 'add_message', data: { sender: 'Machine', id: 'synthetic-card', text: cardAnswer, content_blocks: cardBlocks } },
      { event: 'end', data: { result: { session_id: 'synthetic-session' } } },
    ].map((event) => JSON.stringify(event)).join('\n') + '\n',
  }));
  await loadCheckout(page, nitro, 'Hallo!', {
    width: '380', height: '640', default_language: 'de', checkout_card_venue: venue,
  });
  // Send through the public API: no click or tap that could move the page.
  await page.evaluate(() => {
    (window as unknown as Record<string, { open: (message: string) => void }>)['browser-fixture_api']
      .open('Habt ihr am Samstag noch Plätze?');
  });
  if (check) await expectCard(page);
  await waitForAnswerDone(page);
}

async function waitForAnswerDone(page: Page) {
  // The list is busy while the answer streams. The input takes focus 100 ms
  // after the answer is complete: let that timer run before focusing the card.
  await expect.poll(() => page.evaluate(() => window.__widgetRoots.get(document.querySelector('punku-chat')!)!
    .querySelector('.cl-messages_container')?.getAttribute('aria-busy'))).toBe('false');
  await page.waitForTimeout(500);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function expectCard(page: Page) {
  await expect.poll(() => page.evaluate((selector) => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const button = root.querySelector<HTMLAnchorElement>(selector);
    const card = button?.closest('.cl-checkout-card');
    if (!button || !card) return null;
    const style = getComputedStyle(button);
    return {
      title: card.querySelector('.cl-checkout-card-title')?.textContent,
      venue: card.querySelector('.cl-checkout-card-meta')?.textContent,
      label: button.textContent,
      description: (button.getAttribute('aria-describedby') || '').split(' ').map((id) => root.getElementById(id)?.textContent).join(' / '),
      href: button.href,
      filled: style.backgroundColor !== 'rgba(0, 0, 0, 0)',
      fullWidth: Math.abs(button.getBoundingClientRect().width - (card.clientWidth - 24)) <= 1,
      linkButtons: root.querySelectorAll('.cl-link-only').length,
    };
  }, cardButton)).toEqual({
    title: '2 Tickets · Nachtführung in der Alten Mühle',
    venue: 'Burg Beispielstein',
    label: 'Tickets buchen',
    description: '2 Tickets · Nachtführung in der Alten Mühle / Burg Beispielstein',
    href: checkoutUrl,
    filled: true,
    fullWidth: true,
    linkButtons: 0,
  });
}

async function assertCardButtonFocused(page: Page) {
  await expect.poll(() => page.evaluate((selector) => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    return root.activeElement === root.querySelector(selector);
  }, cardButton)).toBe(true);
}

test.describe('checkout card', () => {
  for (const nitro of [false, true]) {
    test(`a streamed card opens the on-page checkout and returns focus to its button (Nitro ${nitro})`, async ({ page, hasTouch }) => {
      await loadCardAnswer(page, nitro);
      await activate(page, cardButton, hasTouch);
      await waitForCheckout(page);
      await activate(page, `${dialogSelector} button`, hasTouch);
      await expect.poll(() => elementState(page, dialogSelector)).toBeNull();
      await assertCardButtonFocused(page);
      await assertNoPopup(page, nitro ? 2 : 0);
    });
  }

  // A made-up name of 117 characters with a 52-letter compound word, and a
  // venue of 104 characters that wraps to three lines on a 320 px phone.
  test('a long name and a long venue wrap inside the card on a phone', async ({ page }, testInfo) => {
    test.skip(!['narrow-phone', 'iphone'].includes(testInfo.project.name), 'Runs on the narrow and the iPhone profile.');
    const product = 'Donaudampfschifffahrtsgesellschaftskapitänsrundfahrt mit Abendessen, Weinprobe und Laternenführung durch die Altstadt';
    const venue = 'Historischer Hafenspeicher am Nordufer des Beispielsees, Eingang über den Innenhof neben der alten Werft';
    await loadCardAnswer(page, false, { product, venue, check: false });

    const layout = await page.evaluate(() => {
      const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
      const list = root.querySelector<HTMLElement>('.cl-messages_container')!;
      // The visitor scrolls to the end of the answer.
      list.scrollTop = list.scrollHeight;
      const card = root.querySelector<HTMLElement>('.cl-checkout-card')!;
      const bubble = card.closest<HTMLElement>('.cl-bot_message')!;
      const title = card.querySelector<HTMLElement>('.cl-checkout-card-title')!;
      const venueLine = card.querySelector<HTMLElement>('.cl-checkout-card-meta')!;
      const button = card.querySelector<HTMLElement>('.cl-checkout-card-button')!;
      const fits = (element: HTMLElement) => element.scrollWidth <= element.clientWidth;
      const box = (element: Element) => element.getBoundingClientRect();
      const [listBox, cardBox, buttonBox] = [box(list), box(card), box(button)];
      return {
        title: title.textContent,
        venue: venueLine.textContent,
        venueLines: Math.round(venueLine.getBoundingClientRect().height / parseFloat(getComputedStyle(venueLine).lineHeight)),
        venueClipped: venueLine.scrollHeight > venueLine.clientHeight + 1,
        fits: { list: fits(list), bubble: fits(bubble), card: fits(card), title: fits(title), venue: fits(venueLine) },
        page: document.documentElement.scrollWidth <= window.innerWidth,
        buttonInCard: buttonBox.left >= cardBox.left && buttonBox.right <= cardBox.right,
        buttonShown: buttonBox.width > 100 && buttonBox.height >= 44 && buttonBox.top >= listBox.top && buttonBox.bottom <= listBox.bottom
          && buttonBox.right <= window.innerWidth,
      };
    });
    expect(layout).toMatchObject({
      title: `2 Tickets · ${product}`,
      venue,
      venueClipped: false,
      fits: { list: true, bubble: true, card: true, title: true, venue: true },
      page: true,
      buttonInCard: true,
      buttonShown: true,
    });
    expect(layout.venueLines).toBeGreaterThanOrEqual(testInfo.project.name === 'narrow-phone' ? 3 : 2);
  });

  test('a card opens with the keyboard and comes back after a page load', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'Keyboard input runs on the three desktop engines.');
    await loadCardAnswer(page, false);
    await page.evaluate((selector) => {
      window.__widgetRoots.get(document.querySelector('punku-chat')!)!.querySelector<HTMLAnchorElement>(selector)!.focus();
    }, cardButton);
    await page.keyboard.press('Enter');
    await waitForCheckout(page);
    await page.keyboard.press('Escape');
    await expect.poll(() => elementState(page, dialogSelector)).toBeNull();
    await assertCardButtonFocused(page);

    // The session keeps the card: no new request, the same card.
    await page.unroute('**/api/v1/run/**');
    await page.reload();
    await expectCard(page);
  });
});
