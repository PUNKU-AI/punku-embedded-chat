import { expect, Page, test } from '@playwright/test';
import { activate, loadWidget } from './widget-helpers';

// Suggested questions, feedback on the newest answer, and scrolling. A
// visitor who scrolls up while an answer streams stays there and gets a
// button back to the newest message.

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

type StoredMessage = { message: string; isSend: boolean; message_id?: string };

async function storeConversation(page: Page, messages: StoredMessage[]) {
  await page.addInitScript((stored) => {
    const now = Date.now();
    localStorage.setItem(`punku-chat-session-${window.location.hostname}-browser-fixture`, JSON.stringify({
      sessionId: 'synthetic-session', messages: stored, createdAt: now, lastActiveAt: now,
      expiresAt: now + 60 * 60 * 1000, domain: window.location.hostname, flowId: 'browser-fixture',
    }));
  }, messages);
}

// Answers stream word by word from a fetch mock in the page: a Playwright
// route can only send the whole body at once.
async function streamSlowAnswers(page: Page, words: string[], wordDelayMs = 60) {
  await page.addInitScript(({ words, wordDelayMs }) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/api/v1/run/')) return originalFetch(input, init);
      const encoder = new TextEncoder();
      let sent = '';
      const stream = new ReadableStream({
        start(controller) {
          let index = 0;
          const push = () => {
            if (index < words.length) {
              sent += (index ? ' ' : '') + words[index++];
              const event = { event: 'add_message', data: { sender: 'Machine', id: 'slow-answer', text: sent } };
              controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
              setTimeout(push, wordDelayMs);
            } else {
              const end = { event: 'end', data: { result: { session_id: 'synthetic-session' } } };
              controller.enqueue(encoder.encode(JSON.stringify(end) + '\n'));
              controller.close();
            }
          };
          setTimeout(push, 100);
        },
      });
      return Promise.resolve(new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }));
    };
  }, { words, wordDelayMs });
}

function listState(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const list = root.querySelector<HTMLElement>('.cl-messages_container')!;
    const opacity = (element: Element | null) => (element ? Number(getComputedStyle(element).opacity) : null);
    const rows = Array.from(root.querySelectorAll('.cl-chat-message.cl-justify-start'))
      .filter((row) => row.querySelector('.feedback-container'));
    return {
      scrollTop: list.scrollTop,
      distanceFromEnd: Math.round(list.scrollHeight - list.clientHeight - list.scrollTop),
      jumpVisible: !!root.querySelector('.cl-jump-latest'),
      botTexts: Array.from(root.querySelectorAll('.cl-bot_message')).map((bubble) => bubble.textContent ?? ''),
      userTexts: Array.from(root.querySelectorAll('.cl-user_message')).map((bubble) => bubble.textContent ?? ''),
      chips: Array.from(root.querySelectorAll('.cl-suggestion')).map((chip) => chip.textContent),
      feedbackOpacity: rows.map((row) => opacity(row.querySelector('.feedback-container'))),
    };
  });
}

const longConversation: StoredMessage[] = Array.from({ length: 10 }, (_, index) => [
  { message: `Question ${index + 1}?`, isSend: true },
  { message: `Answer ${index + 1}. ${'A synthetic answer line. '.repeat(5)}`, isSend: false, message_id: `answer-${index + 1}` },
]).flat();

test('suggested questions show under the welcome message and send on a tap', async ({ page, hasTouch }) => {
  await streamSlowAnswers(page, ['We', 'open', 'at', '10:00.'], 20);
  await loadWidget(page, {
    start_open: 'true', show_closed_widget_hint: 'false',
    suggestions: JSON.stringify(['Opening hours', 'Tickets for families', 'Wheelchair access']),
  });
  await expect.poll(async () => (await listState(page)).chips).toEqual([
    'Opening hours', 'Tickets for families', 'Wheelchair access',
  ]);

  await activate(page, '.cl-suggestion', hasTouch);
  await expect.poll(async () => (await listState(page)).userTexts).toEqual(['Opening hours']);
  await expect.poll(async () => (await listState(page)).botTexts.join(' ')).toContain('We open at 10:00.');
  expect((await listState(page)).chips).toEqual([]);
});

test('the newest answer shows its feedback; older ones on hover, always on touch', async ({ page, hasTouch }) => {
  await storeConversation(page, longConversation.slice(0, 4));
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', width: '380', height: '640' });
  await expect.poll(async () => (await listState(page)).feedbackOpacity.length).toBe(2);
  // Older answer first, newest answer second.
  await expect.poll(async () => (await listState(page)).feedbackOpacity).toEqual([hasTouch ? 1 : 0, 1]);
});

function feedbackButtonState(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const buttons = root.querySelectorAll<HTMLButtonElement>('.cl-message-stack .feedback-button.thumbs-up');
    const button = buttons[buttons.length - 1];
    return {
      focused: root.activeElement === button,
      selected: button.classList.contains('selected'),
      outline: getComputedStyle(button).outlineStyle,
    };
  });
}

test('a keyboard vote keeps the focus ring on the feedback button', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'Keyboard input runs on the three desktop engines.');
  await storeConversation(page, longConversation.slice(0, 4));
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', width: '380', height: '640' });
  // After loadWidget: a later route wins, and the vote must be saved, or it reverts.
  await page.context().route('**/api/v1/monitor/messages/**', (route) => (
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'saved' })
  ));
  await expect.poll(async () => (await listState(page)).feedbackOpacity.length).toBe(2);
  // The chat focuses its input on opening (a keyboard focus). Move on to the
  // newest answer's "Helpful" button, then vote with the keyboard.
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const buttons = root.querySelectorAll<HTMLButtonElement>('.cl-message-stack .feedback-button.thumbs-up');
    buttons[buttons.length - 1].focus();
  });
  await expect.poll(async () => (await feedbackButtonState(page)).focused).toBe(true);
  const saved = page.waitForResponse((response) => response.url().includes('/api/v1/monitor/messages/'));
  await page.keyboard.press('Enter');
  expect((await saved).status()).toBe(200);
  await expect.poll(() => feedbackButtonState(page)).toEqual({ focused: true, selected: true, outline: 'solid' });
});

test('scrolling up during a streamed answer stops the list from following', async ({ page, hasTouch }) => {
  await storeConversation(page, longConversation);
  const words = Array.from({ length: 50 }, (_, index) => `word${index + 1}`);
  await streamSlowAnswers(page, words, 70);
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', width: '380', height: '560' });
  await expect.poll(async () => (await listState(page)).distanceFromEnd).toBeLessThanOrEqual(2);

  await page.evaluate(() => {
    (window as unknown as Record<string, { open: (message: string) => void }>)['browser-fixture_api'].open('Tell me more');
  });
  // The answer starts streaming, and the list follows it.
  await expect.poll(async () => (await listState(page)).botTexts.some((text) => text.includes('word3'))).toBe(true);

  // The visitor scrolls up to read an earlier answer.
  await page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    root.querySelector<HTMLElement>('.cl-messages_container')!.scrollTop = 0;
  });
  await page.waitForTimeout(800);
  const reading = await listState(page);
  expect(reading.scrollTop).toBeLessThanOrEqual(5);
  expect(reading.jumpVisible).toBe(true);

  // The button leads back to the newest message, and the list follows again.
  await activate(page, '.cl-jump-latest', hasTouch);
  await expect.poll(async () => (await listState(page)).jumpVisible).toBe(false);
  await expect.poll(async () => (await listState(page)).botTexts.some((text) => text.includes('word50'))).toBe(true);
  await expect.poll(async () => (await listState(page)).distanceFromEnd).toBeLessThanOrEqual(2);
});
