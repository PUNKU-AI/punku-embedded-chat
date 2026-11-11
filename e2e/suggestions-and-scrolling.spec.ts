import { expect, Page, test } from '@playwright/test';
import {
  activate, fakeKeyboard, loadWidget, setKeyboard, waitForInputFocus, waitForSettledBoxes,
} from './widget-helpers';

// Suggested questions, feedback on the newest answer, and scrolling. A
// visitor who scrolls up while an answer streams stays there and gets a
// button back to the newest message. Before the first message, a long
// welcome message shows from its first line.

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
  // A chat that opens with the page takes no focus. Move the keyboard focus
  // to the newest answer's "Helpful" button, then vote with the keyboard.
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

// About 2,000 characters in 14 paragraphs: taller than the list on every profile.
const longWelcome = [
  'Welcome line one: hello and welcome to the museum.',
  ...Array.from({ length: 12 }, (_, index) => (
    `Paragraph ${index + 2}. ${'We tell you about our opening hours and tickets. '.repeat(3).trim()}`
  )),
  'Welcome last line: ask us anything.',
].join('\n\n');

const phones = ['android', 'iphone', 'narrow-phone', 'phone-landscape'];

// Where the welcome message sits in the list. `firstLineShown`: the top of
// its bubble lies inside the visible part of the list.
function welcomeView(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const list = root.querySelector<HTMLElement>('.cl-messages_container')!;
    const listBox = list.getBoundingClientRect();
    const bubbleTop = root.querySelector('.cl-bot_message')!.getBoundingClientRect().top;
    return {
      scrollTop: list.scrollTop,
      listHeight: list.clientHeight,
      distanceFromEnd: Math.round(list.scrollHeight - list.clientHeight - list.scrollTop),
      firstLineShown: bubbleTop >= listBox.top - 1 && bubbleTop < listBox.bottom,
    };
  });
}

async function waitForOpeningScroll(page: Page) {
  // Before the fix, the list scrolled smoothly to its end when the chat
  // loaded. Give such a scroll the time to run, so the check cannot pass early.
  await waitForSettledBoxes(page, ['.cl-chat-window']);
  await page.waitForTimeout(700);
}

test('a long welcome message opens at its first line; the conversation then follows its end', async ({ page }) => {
  expect(longWelcome.length).toBeGreaterThanOrEqual(2000);
  const words = Array.from({ length: 300 }, (_, index) => `word${index + 1}`);
  await streamSlowAnswers(page, words, 5);
  await loadWidget(page, {
    start_open: 'true', show_closed_widget_hint: 'false', width: '380', height: '560', welcome_message: longWelcome,
  });
  await waitForOpeningScroll(page);

  const opened = await listState(page);
  expect(opened.botTexts[0]).toContain('Welcome line one');
  expect(opened.botTexts[0]).toContain('Welcome last line');
  // The message is taller than the list, and the list shows its start.
  expect(opened.distanceFromEnd).toBeGreaterThan(100);
  expect(opened.scrollTop).toBeLessThanOrEqual(2);
  expect(opened.jumpVisible).toBe(false);
  expect((await welcomeView(page)).firstLineShown).toBe(true);

  // The visitor sends a message. The list follows the answer to its end.
  await page.evaluate(() => {
    (window as unknown as Record<string, { open: (message: string) => void }>)['browser-fixture_api'].open('Tell me more');
  });
  await expect.poll(async () => (await listState(page)).userTexts).toEqual(['Tell me more']);
  await expect.poll(
    async () => (await listState(page)).botTexts.some((text) => text.includes('word300')),
    { timeout: 12000 },
  ).toBe(true);
  await expect.poll(async () => (await listState(page)).distanceFromEnd).toBeLessThanOrEqual(2);
  const answered = await listState(page);
  // The answer is taller than the list: the list moved down with it.
  expect(answered.scrollTop).toBeGreaterThan(100);
  expect(answered.jumpVisible).toBe(false);
  expect(answered.botTexts.join(' ')).not.toContain('Welcome line one');
});

test('the on-screen keyboard keeps a long welcome message at its first line', async ({ page, viewport }, testInfo) => {
  test.skip(!phones.includes(testInfo.project.name), 'The phone profiles run the keyboard case.');
  await fakeKeyboard(page, 0);
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', welcome_message: longWelcome });
  // The visitor taps the input: the keyboard opens.
  await waitForInputFocus(page);
  await waitForOpeningScroll(page);
  const before = await welcomeView(page);
  expect(before.distanceFromEnd).toBeGreaterThan(100);
  expect(before.scrollTop).toBeLessThanOrEqual(2);

  // A phone keyboard covers about 45 % of a portrait screen and 200 px in landscape.
  const keyboard = testInfo.project.name === 'phone-landscape' ? 200 : Math.round(viewport!.height * 0.45);
  await setKeyboard(page, keyboard);
  await waitForSettledBoxes(page, ['.cl-chat-window']);
  // The list is shorter now. Before the fix, it then went to its end.
  await expect.poll(async () => (await welcomeView(page)).listHeight).toBeLessThan(before.listHeight);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(300);

  const open = await welcomeView(page);
  expect(open.scrollTop).toBeLessThanOrEqual(2);
  expect(open.firstLineShown).toBe(true);
  expect((await listState(page)).jumpVisible).toBe(false);
});

// A welcome message of a few lines with four suggested questions.
const shortWelcome = 'Hello and welcome to the museum. We answer your questions about opening hours, tickets and '
  + 'your visit. Choose a question below, or write your own.';
const fourSuggestions = [
  'What are the opening hours this week?',
  'How much are tickets for a family?',
  'Is the museum open to wheelchair users?',
  'Where can we park near the museum?',
];

// Where the last suggestion sits in the list. `lastChipShown`: its whole box
// lies inside the visible part of the list.
function suggestionsView(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const list = root.querySelector<HTMLElement>('.cl-messages_container')!;
    const listBox = list.getBoundingClientRect();
    const chips = Array.from(root.querySelectorAll('.cl-suggestion'));
    const lastChip = chips[chips.length - 1].getBoundingClientRect();
    return {
      chips: chips.length,
      scrollTop: list.scrollTop,
      listHeight: list.clientHeight,
      overflow: Math.round(list.scrollHeight - list.clientHeight),
      distanceFromEnd: Math.round(list.scrollHeight - list.clientHeight - list.scrollTop),
      lastChipShown: lastChip.top >= listBox.top - 1 && lastChip.bottom <= listBox.bottom + 1,
    };
  });
}

test('the on-screen keyboard keeps the part of a short welcome message and its suggestions that the visitor saw', async ({ page, viewport }, testInfo) => {
  const profile = testInfo.project.name;
  test.skip(!phones.includes(profile), 'The phone profiles run the keyboard case.');
  // On the two tall phones the welcome message and all four suggestions fit
  // before the keyboard opens. On the narrow phone and in landscape the list
  // is too short for them from the start.
  const fitsBeforeKeyboard = ['android', 'iphone'].includes(profile);
  await fakeKeyboard(page, 0);
  await loadWidget(page, {
    start_open: 'true', show_closed_widget_hint: 'false',
    welcome_message: shortWelcome, suggestions: JSON.stringify(fourSuggestions),
  });
  await waitForInputFocus(page);
  await waitForOpeningScroll(page);
  const before = await suggestionsView(page);
  expect(before.chips).toBe(4);
  expect(before.scrollTop).toBeLessThanOrEqual(2);
  expect((await welcomeView(page)).firstLineShown).toBe(true);
  if (fitsBeforeKeyboard) {
    expect(before.overflow).toBeLessThanOrEqual(1);
    expect(before.lastChipShown).toBe(true);
  } else {
    expect(before.overflow).toBeGreaterThan(20);
    expect(before.lastChipShown).toBe(false);
  }

  const keyboard = profile === 'phone-landscape' ? 200 : Math.round(viewport!.height * 0.45);
  await setKeyboard(page, keyboard);
  await waitForSettledBoxes(page, ['.cl-chat-window']);
  await expect.poll(async () => (await suggestionsView(page)).listHeight).toBeLessThan(before.listHeight);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(300);

  // The list is now too short for everything, and it hides its scrollbar.
  const open = await suggestionsView(page);
  expect(open.overflow).toBeGreaterThan(20);
  if (fitsBeforeKeyboard) {
    // The visitor saw every suggestion: the list stays at its end, so no
    // suggestion sits hidden below the visible list.
    expect(open.distanceFromEnd).toBeLessThanOrEqual(2);
    expect(open.lastChipShown).toBe(true);
  } else {
    // The visitor read from the first line: the keyboard does not move the list.
    expect(open.scrollTop).toBeLessThanOrEqual(2);
    expect((await welcomeView(page)).firstLineShown).toBe(true);
  }
  expect((await listState(page)).jumpVisible).toBe(false);
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
