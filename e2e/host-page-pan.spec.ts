import { expect, Page, test } from '@playwright/test';
import { loadWidget } from './widget-helpers';

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
const lastLine = 'Line 24 of the synthetic answer.';
const answer = Array.from({ length: 24 }, (_, index) => `Line ${index + 1} of the synthetic answer.`).join('\n\n');
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function widenHostPage(page: Page) {
  // The live page in #69 was 433 px wide on a 390 px phone.
  const banner = '<div style="width:calc(100vw + 43px);height:40px;background:#c8d3df"></div>';
  await page.route(/\/fixture\.html(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('<main>', `${banner}<main>`);
    await route.fulfill({ response, body });
  });
}

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

async function streamAnswer(page: Page) {
  const events = [
    { event: 'add_message', data: { sender: 'Machine', id: 'synthetic-answer', text: answer } },
    { event: 'end', data: { result: { session_id: 'synthetic-session' } } },
  ];
  await page.route(/\/api\/v1\/run\/browser-fixture\?stream=true$/, (route) => route.fulfill({
    contentType: 'application/x-ndjson',
    body: events.map((event) => JSON.stringify(event)).join('\n') + '\n',
  }));
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

async function waitForInputFocus(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    return window.__widgetRoots.get(host)?.activeElement?.classList.contains('cl-input-element');
  })).toBe(true);
}

async function settle(page: Page) {
  // A focus or smooth-scroll pan reports its viewport scroll on a later frame.
  await page.evaluate(() => new Promise<void>((resolve) => {
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())), 500);
  }));
}

async function expectHostViewUnmoved(page: Page) {
  await settle(page);
  expect(await hostView(page)).toMatchObject({ pageLeft: 0, pageTop: 0, largestPan: { left: 0, top: 0 } });
}

async function messageList(page: Page) {
  return page.evaluate((lastLine) => {
    const host = document.querySelector('punku-chat')!;
    const list = window.__widgetRoots.get(host)!.querySelector<HTMLElement>('.cl-messages_container')!;
    return {
      hasAnswer: list.textContent!.includes(lastLine),
      overflows: list.scrollHeight > list.clientHeight,
      distanceFromEnd: Math.round(list.scrollHeight - list.clientHeight - list.scrollTop),
    };
  }, lastLine);
}

test('the open widget never pans a host page that is wider than the viewport', async ({ page }) => {
  await widenHostPage(page);
  await recordHostPan(page);
  await streamAnswer(page);
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false' });

  const loaded = await hostView(page);
  expect(loaded.documentWidth).toBeGreaterThan(loaded.viewportWidth);

  // The window opens and focuses its input 100 ms later.
  await waitForInputFocus(page);
  await expectHostViewUnmoved(page);

  // Send through the public API. A Playwright click or tap scrolls on its own.
  await page.evaluate((widgetId) => {
    (window as unknown as Record<string, { open: (message: string) => void }>)[`${widgetId}_api`]
      .open('When does the museum open?');
  }, widgetId);
  await expect.poll(async () => (await messageList(page)).hasAnswer).toBe(true);

  // The newest message still scrolls into view inside the message list.
  expect((await messageList(page)).overflows).toBe(true);
  await expect.poll(async () => (await messageList(page)).distanceFromEnd).toBeLessThanOrEqual(1);
  await waitForInputFocus(page);
  await expectHostViewUnmoved(page);
});
