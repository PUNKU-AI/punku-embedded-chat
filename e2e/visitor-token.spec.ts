import { test, expect, Page, Request } from '@playwright/test';
import { loadWidget } from './widget-helpers';

// An embed code with a public key: the widget reads its look from the server, trades
// the key for a visitor token at the first message, and sends only the token.
// An older embed code with a widget key still works on a server without the token route.

const PUBLIC_KEY = 'pk_' + 'b'.repeat(32);
const OLD_KEY = 'synthetic-explicit-key';
const TOKEN = 'wt1.synthetic.token';

const reply = [
  JSON.stringify({ event: 'add_message', data: { sender: 'Machine', text: 'Synthetic answer', id: 'synthetic-reply' } }),
  JSON.stringify({ event: 'end', data: { result: { session_id: 'ws1.synthetic.session' } } }),
  '',
].join('\n');

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function send(page: Page, text: string) {
  await expect.poll(() => page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const field = root.querySelector<HTMLTextAreaElement>('.cl-input-element');
    if (root.activeElement !== field) field?.focus({ preventScroll: true });
    return root.activeElement === field;
  })).toBe(true);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

function answerText(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    return root.textContent ?? '';
  });
}

test('a public key embed gets its look and chats with a visitor token only', async ({ page }) => {
  const exchanges: Request[] = [];
  const runs: Request[] = [];
  await page.route('**/api/v1/widget/config?**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ attributes: { window_title: 'Synthetic live title', start_open: 'true' } }),
  }));
  await page.route('**/api/v1/widget/sessions', (route) => {
    exchanges.push(route.request());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: TOKEN, session_id: 'ws1.synthetic.session', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
      }),
    });
  });
  await page.route('**/api/v1/run/**', (route) => {
    runs.push(route.request());
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: reply });
  });

  // The page sets no title and no start state: the server's look fills them in.
  await loadWidget(page, { publishable_key: PUBLIC_KEY, unset: 'window_title,start_open' });

  await expect.poll(() => answerText(page)).toContain('Synthetic live title');
  await send(page, 'Hello');
  await expect.poll(() => answerText(page)).toContain('Synthetic answer');

  expect(exchanges).toHaveLength(1);
  expect(exchanges[0].postDataJSON()).toMatchObject({ flow_id: 'browser-fixture', publishable_key: PUBLIC_KEY });
  expect(exchanges[0].headers()).not.toHaveProperty('x-api-key');
  expect(runs).toHaveLength(1);
  expect(runs[0].headers()['x-widget-token']).toBe(TOKEN);
  expect(runs[0].headers()).not.toHaveProperty('x-api-key');
  expect(runs[0].postDataJSON().session_id).toBe('ws1.synthetic.session');
  // The server's session is stored, so the next page sends it again.
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) => name.startsWith('punku-chat-session-'));
    return key ? JSON.parse(localStorage.getItem(key)!).sessionId : null;
  });
  expect(stored).toBe('ws1.synthetic.session');
});

test('the page title wins over the live look', async ({ page }) => {
  await page.route('**/api/v1/widget/config?**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ attributes: { window_title: 'Synthetic live title' } }),
  }));

  await loadWidget(page, { publishable_key: PUBLIC_KEY, start_open: 'true' });

  await expect.poll(() => answerText(page)).toContain('Museum information');
  expect(await answerText(page)).not.toContain('Synthetic live title');
});

test('a website that the owner did not allow shows a short note', async ({ page }) => {
  await page.route('**/api/v1/widget/sessions', (route) => route.fulfill({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'widget_origin_not_allowed' }),
  }));

  await loadWidget(page, { publishable_key: PUBLIC_KEY, start_open: 'true' });
  await send(page, 'Hello');

  await expect.poll(() => answerText(page)).toContain('This chat is not available on this website.');
  // A retry cannot help: the owner decides the websites.
  const retryButtons = await page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    return Array.from(root.querySelectorAll('button')).filter((button) => button.textContent?.includes('Try again')).length;
  });
  expect(retryButtons).toBe(0);
});

test('an older embed code with a widget key works on a server without the token route', async ({ page }) => {
  const runs: Request[] = [];
  await page.route('**/api/v1/run/**', (route) => {
    runs.push(route.request());
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: reply });
  });

  await loadWidget(page, { api_key: OLD_KEY, start_open: 'true' });
  await send(page, 'Hello');
  await expect.poll(() => answerText(page)).toContain('Synthetic answer');

  expect(runs).toHaveLength(1);
  expect(runs[0].headers()['x-api-key']).toBe(OLD_KEY);
  expect(runs[0].headers()).not.toHaveProperty('x-widget-token');
});
