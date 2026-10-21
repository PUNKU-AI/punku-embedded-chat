import { test, expect, Page } from '@playwright/test';
import { loadWidget } from './widget-helpers';

// The composer: a textarea that grows with the text (at most six lines, then it
// scrolls inside itself). Enter sends, Shift+Enter adds a line break.

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

const twoSentences = 'Hello, I would like to book tickets for four people on Saturday afternoon. '
  + 'Do you offer a family discount and is the exhibition accessible for a wheelchair user?';
const MAX_LINES = 6;

// Synthetic streaming reply in the backend's line-delimited JSON format.
const replyBody = (text: string) => [
  JSON.stringify({ event: 'add_message', data: { sender: 'Machine', text, id: 'synthetic-reply' } }),
  JSON.stringify({ event: 'end', data: { result: { session_id: 'synthetic-session' } } }),
  '',
].join('\n');

async function mockReply(page: Page, text: string) {
  await page.route('**/api/v1/run/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/x-ndjson',
    body: replyBody(text),
  }));
}

async function openComposer(page: Page) {
  await loadWidget(page, { start_open: 'true', width: '360', height: '520' });
  await page.bringToFront();
  // The chat focuses the composer shortly after opening. Wait for that, so
  // the keyboard input goes to the field on every desktop and phone profile.
  await expect.poll(() => page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const field = root.querySelector<HTMLTextAreaElement>('.cl-input-element');
    if (root.activeElement !== field) field?.focus({ preventScroll: true });
    return root.activeElement === field;
  })).toBe(true);
  return composerState(page);
}

function composerState(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const field = root.querySelector<HTMLTextAreaElement>('.cl-input-element')!;
    const style = getComputedStyle(field);
    const rect = field.getBoundingClientRect();
    const chatWindow = root.querySelector('.cl-window')!.getBoundingClientRect();
    const send = root.querySelector('.cl-send-button')!.getBoundingClientRect();
    return {
      tag: field.tagName,
      value: field.value,
      focused: root.activeElement === field,
      fontSize: parseFloat(style.fontSize),
      lineHeight: parseFloat(style.lineHeight),
      padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
      overflowY: style.overflowY,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
      clientHeight: field.clientHeight,
      scrollHeight: field.scrollHeight,
      scrollTop: field.scrollTop,
      windowTop: chatWindow.top,
      windowBottom: chatWindow.bottom,
      windowHeight: chatWindow.height,
      sendTop: send.top,
      sendBottom: send.bottom,
      userMessages: Array.from(root.querySelectorAll('.cl-user_message')).map((el) => el.textContent),
      botMessages: Array.from(root.querySelectorAll('.cl-bot_message')).map((el) => el.textContent),
    };
  });
}

test('the composer is a one-line textarea with a 16px font', async ({ page }) => {
  const state = await openComposer(page);
  expect(state.tag).toBe('TEXTAREA');
  expect(state.fontSize).toBeGreaterThanOrEqual(16);
  expect(state.lineHeight).toBeGreaterThan(0);
  expect(Math.abs(state.height - (state.lineHeight + state.padding))).toBeLessThanOrEqual(2);
  expect(state.overflowY).toBe('hidden');
  expect(state.scrollHeight).toBeLessThanOrEqual(state.clientHeight + 1);
});

test('a long two-sentence message grows the field and stays fully visible', async ({ page }) => {
  const initial = await openComposer(page);
  await page.keyboard.type(twoSentences);
  await expect.poll(async () => (await composerState(page)).value).toBe(twoSentences);
  await expect.poll(async () => (await composerState(page)).height).toBeGreaterThanOrEqual(initial.height + initial.lineHeight - 1);
  const grown = await composerState(page);
  // The field stops at six lines, or at half of a short chat window (phone landscape).
  const maxHeight = Math.min(initial.lineHeight * MAX_LINES + initial.padding, Math.floor(initial.windowHeight / 2));
  expect(grown.height).toBeLessThanOrEqual(maxHeight + 2);
  if (grown.scrollHeight <= maxHeight + 1) {
    // Every typed line is inside the field: nothing is cut off and nothing scrolls.
    expect(grown.scrollHeight).toBeLessThanOrEqual(grown.clientHeight + 1);
    expect(grown.overflowY).toBe('hidden');
  } else {
    // The text needs more than the cap: the field scrolls and shows the newest line.
    expect(Math.abs(grown.height - maxHeight)).toBeLessThanOrEqual(2);
    expect(grown.overflowY).toBe('auto');
    expect(grown.scrollTop + grown.clientHeight).toBeGreaterThanOrEqual(grown.scrollHeight - 2);
  }
  // The field and the send button stay inside the chat window and the viewport.
  const viewport = page.viewportSize()!;
  expect(grown.bottom).toBeLessThanOrEqual(Math.min(grown.windowBottom, viewport.height) + 1);
  expect(grown.top).toBeGreaterThanOrEqual(grown.windowTop);
  expect(grown.sendBottom).toBeLessThanOrEqual(grown.bottom + 1);
  expect(grown.sendTop).toBeGreaterThanOrEqual(grown.top - 1);
  expect(grown.userMessages).toEqual([]);

  await mockReply(page, 'Yes, we offer a family ticket.');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await composerState(page)).userMessages).toEqual([twoSentences]);
  await expect.poll(async () => (await composerState(page)).value).toBe('');
  // The field shrinks back to one line after the send.
  await expect.poll(async () => Math.abs((await composerState(page)).height - initial.height)).toBeLessThanOrEqual(2);
});

test('Shift+Enter adds a line break without sending', async ({ page }) => {
  const initial = await openComposer(page);
  await page.keyboard.type('First line');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Second line');
  await expect.poll(async () => (await composerState(page)).value).toBe('First line\nSecond line');
  await expect.poll(async () => Math.abs((await composerState(page)).height - (initial.height + initial.lineHeight))).toBeLessThanOrEqual(2);
  const state = await composerState(page);
  expect(state.userMessages).toEqual([]);
  expect(state.overflowY).toBe('hidden');
});

test('Enter sends the message, clears the field, and shows the reply', async ({ page, hasTouch }) => {
  const initial = await openComposer(page);
  await mockReply(page, 'The museum opens at 10:00 on Monday.');
  await page.keyboard.type('Is the museum open on Monday?');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await composerState(page)).userMessages).toEqual(['Is the museum open on Monday?']);
  await expect.poll(async () => (await composerState(page)).botMessages.join('\n')).toContain('The museum opens at 10:00 on Monday.');
  const state = await composerState(page);
  expect(state.value).toBe('');
  expect(Math.abs(state.height - initial.height)).toBeLessThanOrEqual(2);
  if (!hasTouch) {
    // Desktop keeps the keyboard in the composer after the reply.
    await expect.poll(async () => (await composerState(page)).focused).toBe(true);
  }
});

test('more than six lines scroll inside the field and keep the newest line visible', async ({ page }) => {
  const initial = await openComposer(page);
  await page.keyboard.type('Line 1');
  for (let line = 2; line <= MAX_LINES + 3; line += 1) {
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type(`Line ${line}`);
  }
  const expectedMax = Math.min(initial.lineHeight * MAX_LINES + initial.padding, Math.floor(initial.windowHeight / 2));
  await expect.poll(async () => Math.abs((await composerState(page)).height - expectedMax)).toBeLessThanOrEqual(2);
  const state = await composerState(page);
  expect(state.value.split('\n')).toHaveLength(MAX_LINES + 3);
  expect(state.scrollHeight).toBeGreaterThan(state.clientHeight + 1);
  expect(state.overflowY).toBe('auto');
  // The caret line is the last line; it must be scrolled into view inside the field.
  expect(state.scrollTop + state.clientHeight).toBeGreaterThanOrEqual(state.scrollHeight - 2);
  expect(state.userMessages).toEqual([]);
});
