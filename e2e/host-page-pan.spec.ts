import { expect, Page, test } from '@playwright/test';
import { elementState, loadWidget, waitForInputFocus, widenHostPage } from './widget-helpers';

// Issue #69. A host element wider than a phone screen makes the layout viewport
// wider than the visual viewport. scrollIntoView() and a plain focus() inside
// the fixed chat window then pan the visitor's view of the host page. The
// widget must scroll only its own message list.

declare global {
  interface Window {
    __hostPan: { left: number; top: number };
  }
}

const widgetId = 'browser-fixture';
const checkoutUrl = 'https://eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat&c=%5B%5D';
const lastLine = 'Line 24 of the synthetic answer.';
const longAnswer = Array.from({ length: 24 }, (_, index) => `Line ${index + 1} of the synthetic answer.`).join('\n\n');
const checkoutAnswer = `Tickets are available. **[Book tickets](${checkoutUrl})**`;
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function recordHostPan(page: Page) {
  // Keep the largest offset, so a pan that later moves back still fails.
  await page.addInitScript(() => {
    const pan = { left: 0, top: 0 };
    window.__hostPan = pan;
    const record = () => {
      const viewport = window.visualViewport!;
      pan.left = Math.max(pan.left, Math.abs(viewport.pageLeft));
      pan.top = Math.max(pan.top, Math.abs(viewport.pageTop));
    };
    window.visualViewport!.addEventListener('scroll', record);
    window.addEventListener('scroll', record);
  });
}

async function streamAnswers(page: Page, answers: string[]) {
  // Each request gets the next answer. The last answer repeats.
  let request = 0;
  await page.route(/\/api\/v1\/run\/browser-fixture\?stream=true$/, (route) => {
    const text = answers[Math.min(request, answers.length - 1)];
    request += 1;
    const events = [
      { event: 'add_message', data: { sender: 'Machine', id: `synthetic-answer-${request}`, text } },
      { event: 'end', data: { result: { session_id: 'synthetic-session' } } },
    ];
    return route.fulfill({
      contentType: 'application/x-ndjson',
      body: events.map((event) => JSON.stringify(event)).join('\n') + '\n',
    });
  });
}

async function openWidePage(page: Page, answers: string[], props: Record<string, string> = {}) {
  await widenHostPage(page);
  await recordHostPan(page);
  await streamAnswers(page, answers);
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', ...props });
  const view = await hostView(page);
  expect(view.documentWidth).toBeGreaterThan(view.viewportWidth);
  // The visitor clicks into the chat that opened with the page.
  await waitForInputFocus(page);
}

async function hostView(page: Page) {
  return page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.visualViewport!.width,
    pageLeft: window.visualViewport!.pageLeft,
    pageTop: window.visualViewport!.pageTop,
    largestPan: { ...window.__hostPan },
  }));
}

async function settle(page: Page) {
  // A focus or smooth-scroll pan reports its viewport scroll on a later frame.
  await page.evaluate(() => new Promise<void>((resolve) => {
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())), 500);
  }));
}

async function waitForAnswerDone(page: Page) {
  // The message list is aria-busy while an answer streams. The input gets
  // focus 100 ms after the answer is complete, so wait until the list is no
  // longer busy, then let that focus timer run.
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    return window.__widgetRoots.get(host)?.querySelector('.cl-messages_container')?.getAttribute('aria-busy');
  })).toBe('false');
  await settle(page);
}

async function expectHostViewUnmoved(page: Page) {
  await settle(page);
  expect(await hostView(page)).toMatchObject({ pageLeft: 0, pageTop: 0, largestPan: { left: 0, top: 0 } });
}

async function sendMessage(page: Page, message: string) {
  // Send through the public API. A Playwright click or tap scrolls on its own.
  await page.evaluate(({ widgetId, message }) => {
    (window as unknown as Record<string, { open: (message: string) => void }>)[`${widgetId}_api`].open(message);
  }, { widgetId, message });
}

async function messageList(page: Page) {
  return page.evaluate(({ lastLine, checkoutUrl }) => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const list = root.querySelector<HTMLElement>('.cl-messages_container')!;
    const link = root.querySelector<HTMLAnchorElement>(`.markdown-body a[href="${checkoutUrl}"]`);
    const top = list.getBoundingClientRect().top + list.clientTop;
    const linkBox = link?.getBoundingClientRect();
    return {
      hasLongAnswer: list.textContent!.includes(lastLine),
      hasLink: !!link,
      overflows: list.scrollHeight > list.clientHeight,
      distanceFromEnd: Math.round(list.scrollHeight - list.clientHeight - list.scrollTop),
      linkFocused: !!link && root.activeElement === link,
      linkVisible: !!linkBox && linkBox.top >= top - 1 && linkBox.bottom <= top + list.clientHeight + 1,
    };
  }, { lastLine, checkoutUrl });
}

async function expectListAtEnd(page: Page) {
  // The newest message scrolls into view inside the message list.
  expect((await messageList(page)).overflows).toBe(true);
  await expect.poll(async () => (await messageList(page)).distanceFromEnd).toBeLessThanOrEqual(1);
}

async function checkoutDisplay(page: Page) {
  return (await elementState(page, '.cl-bk-checkout-dialog'))?.display ?? null;
}

test('the open widget never pans a host page that is wider than the viewport', async ({ page }) => {
  await openWidePage(page, [longAnswer]);
  await expectHostViewUnmoved(page);

  await sendMessage(page, 'When does the museum open?');
  await expect.poll(async () => (await messageList(page)).hasLongAnswer).toBe(true);
  await expectListAtEnd(page);
  await waitForAnswerDone(page);
  await waitForInputFocus(page);
  await expectHostViewUnmoved(page);
});

test('a restored session never pans a host page that is wider than the viewport', async ({ page }) => {
  const messages = Array.from({ length: 12 }, (_, index) => [
    { message: `Question ${index + 1}?`, isSend: true },
    { message: `Answer ${index + 1}. ${'Synthetic text. '.repeat(6)}`, isSend: false },
  ]).flat();
  await page.addInitScript((messages) => {
    const now = Date.now();
    localStorage.setItem(`punku-chat-session-${window.location.hostname}-browser-fixture`, JSON.stringify({
      sessionId: 'synthetic-session', messages, createdAt: now, lastActiveAt: now,
      expiresAt: now + 60 * 60 * 1000, domain: window.location.hostname, flowId: 'browser-fixture',
    }));
  }, messages);

  await openWidePage(page, [longAnswer]);
  await expectListAtEnd(page);
  await expectHostViewUnmoved(page);
});

test('checkout opens and closes without a pan and shows the restored link', async ({ page }) => {
  await openWidePage(page, [checkoutAnswer, longAnswer]);
  // Register after loadWidget's external-request blocker. Never contact Bookingkit.
  await page.context().route(checkoutUrl, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Synthetic checkout</title><h1>Synthetic checkout</h1>',
  }));

  await sendMessage(page, 'Can I book tickets?');
  await expect.poll(async () => (await messageList(page)).hasLink).toBe(true);
  await waitForAnswerDone(page);
  await waitForInputFocus(page);

  // Focus is setup only. Real keyboard input opens checkout.
  await page.evaluate((checkoutUrl) => {
    const host = document.querySelector('punku-chat')!;
    window.__widgetRoots.get(host)!.querySelector<HTMLAnchorElement>(`.markdown-body a[href="${checkoutUrl}"]`)!
      .focus({ preventScroll: true });
  }, checkoutUrl);
  await page.keyboard.press('Enter');
  await expect.poll(() => checkoutDisplay(page)).toBe('flex');
  await expectHostViewUnmoved(page);

  // A new answer arrives while checkout is open and scrolls the link out of view.
  await sendMessage(page, 'What else can I see?');
  await expect.poll(async () => (await messageList(page)).hasLongAnswer).toBe(true);
  await expectListAtEnd(page);
  // The modal makes the input inert, so its focus timer cannot take focus.
  await waitForAnswerDone(page);
  expect((await messageList(page)).linkVisible).toBe(false);

  await page.keyboard.press('Escape');
  await expect.poll(() => checkoutDisplay(page)).toBeNull();
  // Focus returns to the link, and only the message list scrolls to show it.
  await expect.poll(async () => {
    const { linkFocused, linkVisible } = await messageList(page);
    return { linkFocused, linkVisible };
  }).toEqual({ linkFocused: true, linkVisible: true });
  await expectHostViewUnmoved(page);
});
