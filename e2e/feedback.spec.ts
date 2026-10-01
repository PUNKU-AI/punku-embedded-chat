import { expect, Page, Request, test } from '@playwright/test';
import { activate, elementState, loadWidget } from './widget-helpers';

const fixtureOrigin = 'http://127.0.0.1:4179';
// Another port makes this cross-origin but keeps cookie eligibility identical.
// Both ports run the synthetic local fixture; no external API receives traffic.
const crossOrigin = 'http://127.0.0.1:4180';
const flowId = 'feedback-browser-fixture';
const messageId = 'synthetic-feedback-message';
const messageText = 'The museum opens at 10:00.';
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function loadFeedback(page: Page, hostUrl = fixtureOrigin, props: Record<string, string> = {}) {
  await page.context().addCookies([
    { name: 'XSRF-TOKEN', value: 'synthetic-host-xsrf', url: fixtureOrigin },
    { name: 'widget-session', value: 'synthetic-host-session', url: fixtureOrigin },
  ]);
  // Use the persisted session format. Welcome messages intentionally lack feedback.
  await page.addInitScript(({ flowId, messageId, messageText }) => {
    const now = Date.now();
    window.localStorage.setItem(`punku-chat-session-${window.location.hostname}-${flowId}`, JSON.stringify({
      sessionId: 'synthetic-feedback-session',
      flowId,
      domain: window.location.hostname,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + 60 * 60 * 1000,
      messages: [{ message: messageText, message_id: messageId, isSend: false }],
    }));
  }, { flowId, messageId, messageText });
  await loadWidget(page, {
    start_open: 'true', flow_id: flowId, host_url: hostUrl,
    enable_client_error_reporting: 'false', ...props,
  });
  await expect.poll(async () => (await elementState(page, '.markdown-body'))?.text).toBe(messageText);
  await expect.poll(() => elementState(page, '.feedback-button.thumbs-up')).not.toBeNull();
  expect(await page.evaluate(() => document.cookie)).toContain('XSRF-TOKEN=synthetic-host-xsrf');
}

async function selectedFeedback(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    return Array.from(root.querySelectorAll('.feedback-button.selected'))
      .map((button) => button.getAttribute('aria-label'));
  });
}

async function assertRequest(request: Request, positive: boolean) {
  expect(request.method()).toBe('PUT');
  expect(request.postDataJSON()).toEqual({ properties: { positive_feedback: positive } });
  const headers = await request.allHeaders();
  expect(headers['content-type']).toBe('application/json');
  expect(headers['x-xsrf-token']).toBeUndefined();
  return headers;
}

type ReceivedFeedback = {
  method: string;
  headers: Record<string, string | undefined>;
  body: unknown;
};

async function resetObservations(page: Page, origin: string) {
  const response = await page.request.delete(`${origin}/feedback-observations`);
  expect(response.status()).toBe(204);
}

async function readObservations(page: Page, origin: string): Promise<ReceivedFeedback[]> {
  const response = await page.request.get(`${origin}/feedback-observations`);
  expect(response.status()).toBe(200);
  return response.json();
}

function assertReceivedFeedback(request: ReceivedFeedback, positive: boolean) {
  expect(request.method).toBe('PUT');
  expect(request.body).toEqual({ properties: { positive_feedback: positive } });
  expect(request.headers['content-type']).toBe('application/json');
  expect(request.headers['x-xsrf-token']).toBeUndefined();
  return request.headers;
}

test('feedback sends both votes without copying host XSRF cookies into headers', async ({ page, hasTouch }) => {
  await loadFeedback(page);
  const endpoint = `${fixtureOrigin}/api/v1/monitor/messages/${messageId}`;
  await resetObservations(page, fixtureOrigin);

  for (const positive of [true, false]) {
    const responsePromise = page.waitForResponse((response) => response.url() === endpoint);
    await activate(page, `.feedback-button.${positive ? 'thumbs-up' : 'thumbs-down'}`, hasTouch);
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    await response.finished();
    // Inspect the actual HTTP request. WebKit's intercepted headers omit cookies.
    const requests = await readObservations(page, fixtureOrigin);
    expect(requests).toHaveLength(positive ? 1 : 2);
    const headers = assertReceivedFeedback(requests[requests.length - 1], positive);
    // The existing same-origin session still works, but its XSRF token stays a cookie.
    expect(headers.cookie).toContain('widget-session=synthetic-host-session');
    expect(headers.cookie).toContain('XSRF-TOKEN=synthetic-host-xsrf');
    expect(headers['x-api-key']).toBeUndefined();
    await expect.poll(() => selectedFeedback(page)).toEqual([positive ? 'Thumbs up' : 'Thumbs down']);
  }
});

test('cross-origin feedback keeps explicit headers and excludes ambient cookies', async ({ page, hasTouch }) => {
  await loadFeedback(page, crossOrigin, {
    api_key: 'synthetic-explicit-key',
    additional_headers: JSON.stringify({
      'X-API-KEY': 'synthetic-override-key',
      'X-Widget-Test': 'synthetic-explicit-header',
    }),
  });
  const endpoint = `${crossOrigin}/api/v1/monitor/messages/${messageId}`;
  await resetObservations(page, crossOrigin);
  const responsePromise = page.waitForResponse((response) =>
    response.url() === endpoint && response.request().method() === 'PUT');
  await activate(page, '.feedback-button.thumbs-up', hasTouch);
  const response = await responsePromise;
  expect(response.status()).toBe(204);
  await response.finished();
  const requests = await readObservations(page, crossOrigin);
  expect(requests).toHaveLength(1);
  const headers = assertReceivedFeedback(requests[0], true);
  expect(headers['x-api-key']).toBe('synthetic-override-key');
  expect(headers['x-widget-test']).toBe('synthetic-explicit-header');
  expect(headers.cookie).toBeUndefined();
  await expect.poll(() => selectedFeedback(page)).toEqual(['Thumbs up']);
});

test('failed feedback clears the selected vote and permits a successful retry', async ({ page, hasTouch }) => {
  await loadFeedback(page);
  const endpoint = `${fixtureOrigin}/api/v1/monitor/messages/${messageId}`;
  let requestCount = 0;
  let releaseFailure!: () => void;
  const failureGate = new Promise<void>((resolve) => { releaseFailure = resolve; });
  await page.context().route(endpoint, async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await failureGate;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Synthetic failure"}' });
    } else {
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'saved' });
    }
  });

  const requestPromise = page.waitForRequest((request) => request.url() === endpoint);
  const failurePromise = page.waitForResponse((response) => response.url() === endpoint);
  try {
    await activate(page, '.feedback-button.thumbs-down', hasTouch);
    await assertRequest(await requestPromise, false);
    // Hold the response until the optimistic state is visible. No timing guesses.
    await expect.poll(() => selectedFeedback(page)).toEqual(['Thumbs down']);
  } finally {
    releaseFailure();
  }
  const failedResponse = await failurePromise;
  expect(failedResponse.status()).toBe(500);
  await failedResponse.finished();
  await expect.poll(() => selectedFeedback(page)).toEqual([]);

  const retryPromise = page.waitForResponse((response) => response.url() === endpoint);
  await activate(page, '.feedback-button.thumbs-up', hasTouch);
  const retryResponse = await retryPromise;
  expect(retryResponse.status()).toBe(200);
  await retryResponse.finished();
  await assertRequest(retryResponse.request(), true);
  await expect.poll(() => selectedFeedback(page)).toEqual(['Thumbs up']);
  expect(requestCount).toBe(2);
});
