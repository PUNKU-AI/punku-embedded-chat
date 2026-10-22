import { expect, Page, test } from '@playwright/test';
import { thinkingMessages } from '../src/translations';
import { activate, loadWidget } from './widget-helpers';

// Thinking and error states. While the assistant prepares an answer, its bubble
// shows three dots and a thinking phrase in the chat's language, and the field
// stays enabled. A failed answer shows a plain sentence and a Try again button,
// which sends the visitor's question again.

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

const question = 'When does the museum open?';
const answer = 'The museum opens at 10:00.';
const technicalText = 'Error building Component OpenAI Model: Error code: 401';
const technicalSentence = "Sorry, we're experiencing technical issues. Please try again.";
// Synthetic streaming replies in the backend's line-delimited JSON format.
const replyBody = [
  JSON.stringify({ event: 'add_message', data: { sender: 'Machine', text: answer, id: 'synthetic-reply' } }),
  JSON.stringify({ event: 'end', data: { result: { session_id: 'synthetic-session' } } }),
  '',
].join('\n');
const flowErrorBody = JSON.stringify({ event: 'error', data: { text: technicalText } }) + '\n';

type Reply = 'answer' | 'server-error' | 'flow-error' | 'network-error';

// Each request gets the next reply; the last reply repeats. A request whose
// number (0, 1, ...) is in hold waits until the test calls release(number),
// so the test can look at the thinking state.
async function mockAssistant(page: Page, replies: Reply[], { hold = [] as number[] } = {}) {
  const releases = new Map<number, () => void>();
  const gates = new Map<number, Promise<void>>();
  for (const request of hold) {
    gates.set(request, new Promise<void>((resolve) => { releases.set(request, resolve); }));
  }
  let requests = 0;
  await page.route('**/api/v1/run/**', async (route) => {
    const request = requests;
    requests += 1;
    const reply = replies[Math.min(request, replies.length - 1)];
    await gates.get(request);
    if (reply === 'network-error') return route.abort('failed');
    if (reply === 'server-error') {
      return route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error: synthetic failure' });
    }
    const body = reply === 'flow-error' ? flowErrorBody : replyBody;
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body });
  });
  return { release: (request = 0) => releases.get(request)?.(), requests: () => requests };
}

async function openChat(page: Page, props: Record<string, string> = {}) {
  await loadWidget(page, {
    start_open: 'true', width: '360', height: '520', enable_client_error_reporting: 'false', ...props,
  });
  await page.bringToFront();
  // The chat focuses the field shortly after opening. Wait for that, so the
  // keyboard input goes to the field on every desktop and phone profile.
  await expect.poll(() => page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const field = root.querySelector<HTMLTextAreaElement>('.cl-input-element');
    if (root.activeElement !== field) field?.focus({ preventScroll: true });
    return root.activeElement === field;
  })).toBe(true);
}

function chatState(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const field = root.querySelector<HTMLTextAreaElement>('.cl-input-element')!;
    const send = root.querySelector<HTMLButtonElement>('.cl-send-button')!;
    const typing = root.querySelector<HTMLElement>('.cl-typing');
    const error = root.querySelector<HTMLElement>('.cl-error_message');
    const retry = root.querySelector<HTMLElement>('.cl-retry-btn');
    const list = root.querySelector<HTMLElement>('.cl-messages_container')!.getBoundingClientRect();
    const errorBox = error?.getBoundingClientRect();
    const errorStyle = error ? getComputedStyle(error) : null;
    return {
      fieldDisabled: field.disabled,
      fieldFocused: root.activeElement === field,
      fieldValue: field.value,
      placeholder: field.placeholder,
      sendDisabled: send.disabled,
      typingDots: typing ? typing.querySelectorAll('.cl-typing-dots span').length : 0,
      typingText: typing?.querySelector('.cl-typing-text')?.textContent ?? null,
      status: root.querySelector('[role="status"]')?.textContent ?? null,
      errorText: error?.querySelector('.cl-error-text')?.textContent ?? null,
      errorColors: errorStyle ? { color: errorStyle.color, background: errorStyle.backgroundColor } : null,
      errorInsideList: !!errorBox && errorBox.left >= list.left - 1 && errorBox.right <= list.right + 1,
      retryLabel: retry?.textContent ?? null,
      retryColor: retry ? getComputedStyle(retry).color : null,
      userMessages: Array.from(root.querySelectorAll('.cl-user_message')).map((el) => el.textContent),
      botMessages: Array.from(root.querySelectorAll('.cl-bot_message:not(.cl-typing)')).map((el) => el.textContent ?? ''),
    };
  });
}

test('the thinking bubble shows dots and an English phrase, and the field stays enabled', async ({ page }) => {
  const assistant = await mockAssistant(page, ['answer'], { hold: [0] });
  await openChat(page);
  await page.keyboard.type(question);
  await page.keyboard.press('Enter');

  await expect.poll(async () => (await chatState(page)).typingDots).toBe(3);
  const thinking = await chatState(page);
  expect(thinkingMessages.en).toContain(thinking.typingText);
  expect(thinking.status).toBe('The assistant is writing');
  expect(thinking.fieldDisabled).toBe(false);
  expect(thinking.placeholder).toBe('Type your message...');
  expect(thinking.sendDisabled).toBe(true);

  // The visitor can write the next question while the assistant answers.
  // Enter does not send it yet: the text stays in the field.
  await page.keyboard.type('And on Sunday?');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await chatState(page)).fieldValue).toBe('And on Sunday?');
  expect((await chatState(page)).userMessages).toEqual([question]);

  assistant.release(0);
  await expect.poll(async () => (await chatState(page)).botMessages.join('\n')).toContain(answer);
  const done = await chatState(page);
  expect(done.typingDots).toBe(0);
  expect(done.sendDisabled).toBe(false);
  // Screen readers hear the complete answer once.
  expect(done.status).toBe(answer);
  expect(done.fieldValue).toBe('And on Sunday?');
  expect(assistant.requests()).toBe(1);
});

test('a flow error shows a plain German sentence, and Try again keeps focus and sends again', async ({ page, hasTouch }) => {
  const assistant = await mockAssistant(page, ['flow-error', 'answer'], { hold: [0, 1] });
  await openChat(page, { default_language: 'de' });
  await page.keyboard.type(question);
  await page.keyboard.press('Enter');

  await expect.poll(async () => (await chatState(page)).typingDots).toBe(3);
  const thinking = await chatState(page);
  expect(thinkingMessages.de).toContain(thinking.typingText);
  expect(thinking.status).toBe('Der Assistent schreibt');
  expect(thinking.placeholder).toBe('Nachricht eingeben...');

  assistant.release(0);
  const sentence = 'Entschuldigung, wir haben gerade technische Probleme. Bitte versuchen Sie es erneut.';
  await expect.poll(async () => (await chatState(page)).errorText).toBe(sentence);
  const failed = await chatState(page);
  expect(failed.retryLabel).toBe('Erneut versuchen');
  expect(failed.status).toBe(sentence);
  expect(failed.userMessages).toEqual([question]);
  expect(failed.sendDisabled).toBe(false);
  expect(failed.errorInsideList).toBe(true);
  // A light red notice with dark red text, never the flow's technical text.
  expect(failed.errorColors).toEqual({ color: 'rgb(153, 27, 27)', background: 'rgb(254, 242, 242)' });
  expect(failed.errorText).not.toMatch(/Error building|401|Component/);

  // Try again removes its own button: the keyboard focus moves to the field.
  await activate(page, '.cl-retry-btn', hasTouch);
  await expect.poll(async () => (await chatState(page)).typingDots).toBe(3);
  const retrying = await chatState(page);
  expect(retrying.errorText).toBeNull();
  expect(retrying.fieldFocused).toBe(true);
  expect(retrying.status).toBe('Der Assistent schreibt');

  assistant.release(1);
  await expect.poll(async () => (await chatState(page)).botMessages.join('\n')).toContain(answer);
  const retried = await chatState(page);
  // The question is sent again, but its bubble is not repeated.
  expect(retried.userMessages).toEqual([question]);
  expect(retried.status).toBe(answer);
  expect(assistant.requests()).toBe(2);
});

test('a network failure in the dark theme shows a readable English sentence', async ({ page }) => {
  await mockAssistant(page, ['network-error']);
  await openChat(page, { theme: 'dark' });
  await page.keyboard.type(question);
  await page.keyboard.press('Enter');

  const sentence = 'The assistant could not be reached. Check your connection and try again.';
  await expect.poll(async () => (await chatState(page)).errorText).toBe(sentence);
  const failed = await chatState(page);
  expect(failed.retryLabel).toBe('Try again');
  expect(failed.errorInsideList).toBe(true);
  // Light red text on a dark red tint, readable on the dark window.
  expect(failed.errorColors?.color).toBe('rgb(254, 202, 202)');
});

// A site's error_message_style can set only some colours. The box then starts
// from the classic red box with white text, so the text stays readable.
const partialStyles = [
  {
    name: 'a background colour only',
    style: { backgroundColor: '#b91c1c' },
    colors: { color: 'rgb(255, 255, 255)', background: 'rgb(185, 28, 28)' },
  },
  {
    name: 'a text colour only',
    style: { color: '#ffffff' },
    colors: { color: 'rgb(255, 255, 255)', background: 'rgb(248, 113, 113)' },
  },
];

for (const { name, style, colors } of partialStyles) {
  test(`error_message_style with ${name} starts from the classic red box`, async ({ page }) => {
    await mockAssistant(page, ['server-error']);
    await openChat(page, { error_message_style: JSON.stringify(style) });
    await page.keyboard.type(question);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await chatState(page)).errorText).toBe(technicalSentence);
    const failed = await chatState(page);
    expect(failed.errorColors).toEqual(colors);
    // Try again uses the text colour of the box.
    expect(failed.retryColor).toBe(colors.color);
  });
}
