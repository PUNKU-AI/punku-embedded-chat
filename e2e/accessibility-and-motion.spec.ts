import { expect, Page, test } from '@playwright/test';
import { extendHostPage, loadWidget, waitForInputFocus, waitForSettledBoxes } from './widget-helpers';

// Accessibility and motion. The launcher says what it does and whether the
// chat is open. The closed window leaves the tab order. Escape returns the
// focus to the launcher. Only a visitor action moves the focus into the chat.
// The message list is a named log. Reduced motion turns the open fade and the
// message fade off.

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

function state(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const trigger = root.querySelector<HTMLButtonElement>('.cl-trigger')!;
    const chatWindow = root.querySelector<HTMLElement>('.cl-chat-window')!;
    const list = root.querySelector<HTMLElement>('.cl-messages_container')!;
    const windowStyle = getComputedStyle(chatWindow);
    return {
      triggerLabel: trigger.getAttribute('aria-label'),
      triggerExpanded: trigger.getAttribute('aria-expanded'),
      windowVisibility: windowStyle.visibility,
      windowOpacity: Number(windowStyle.opacity),
      windowTransition: windowStyle.transitionDuration,
      windowTransitionProperty: windowStyle.transitionProperty,
      messageAnimation: (() => {
        const message = root.querySelector<HTMLElement>('.cl-chat-message');
        return message ? getComputedStyle(message).animationName : null;
      })(),
      listRole: list.getAttribute('role'),
      listLabel: list.getAttribute('aria-label'),
      focus: root.activeElement?.className ?? null,
    };
  });
}

async function openByApi(page: Page) {
  await page.evaluate(() => {
    (window as unknown as Record<string, { open: () => void }>)['browser-fixture_api'].open();
  });
}

test('the launcher names its action and the chat state', async ({ page }) => {
  await loadWidget(page, { show_closed_widget_hint: 'false' });
  await expect.poll(async () => (await state(page)).triggerLabel).toBe('Open chat');
  expect((await state(page)).triggerExpanded).toBe('false');

  await openByApi(page);
  await expect.poll(async () => (await state(page)).triggerLabel).toBe('Close chat');
  expect((await state(page)).triggerExpanded).toBe('true');
});

test('the closed window is hidden from the tab order and screen readers', async ({ page }) => {
  await loadWidget(page, { show_closed_widget_hint: 'false' });
  // visibility: hidden removes the window's controls from the tab order.
  await expect.poll(async () => (await state(page)).windowVisibility).toBe('hidden');

  await openByApi(page);
  await expect.poll(async () => (await state(page)).windowVisibility).toBe('visible');
  await expect.poll(async () => (await state(page)).windowOpacity).toBe(1);
});

test('Escape closes the chat and returns the focus to the launcher', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'Keyboard input runs on the three desktop engines.');
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false' });
  // The visitor clicks into the chat that opened with the page.
  await waitForInputFocus(page);

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).focus).toContain('cl-trigger');
  await expect.poll(async () => (await state(page)).windowVisibility).toBe('hidden');
});

test.describe('focus on open only after a visitor action (WCAG 3.2.1)', () => {
  // Where the page has the focus: an element id, or the widget part's class.
  function pageFocus(page: Page) {
    return page.evaluate(() => {
      const active = document.activeElement;
      if (active?.localName !== 'punku-chat') return active?.id || active?.localName || null;
      return window.__widgetRoots.get(active)!.activeElement?.className ?? 'punku-chat';
    });
  }

  // The window focuses its input 100 ms after a visitor opens it. Wait well past that.
  async function waitPastFocusTimer(page: Page) {
    await waitForSettledBoxes(page, ['.cl-chat-window']);
    await page.waitForTimeout(400);
  }

  test('a chat that opens with the page leaves the focus on the page', async ({ page }) => {
    await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false' });
    await waitPastFocusTimer(page);

    expect(await pageFocus(page)).toBe('body');
  });

  test('a chat that a page timer opens leaves the visitor typing in the page', async ({ page }) => {
    // A synthetic answer in the backend's line-delimited JSON format.
    await page.route('**/api/v1/run/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: [
        JSON.stringify({ event: 'add_message', data: { sender: 'Machine', text: 'We open at 9.', id: 'synthetic-reply' } }),
        JSON.stringify({ event: 'end', data: { result: { session_id: 'synthetic-session' } } }),
        '',
      ].join('\n'),
    }));
    await extendHostPage(page, '<input id="search" aria-label="Search the museum">');
    await loadWidget(page, { show_closed_widget_hint: 'false' });
    await page.focus('#search');
    await page.keyboard.type('Tick');

    // A timer opens the chat with a question, as api.open("…") does. The answer arrives.
    await page.evaluate(() => new Promise<void>((resolve) => setTimeout(() => {
      (window as unknown as Record<string, { open: (message?: string) => void }>)['browser-fixture_api'].open('Opening hours?');
      resolve();
    }, 50)));
    await expect.poll(() => page.evaluate(() => {
      const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
      return Array.from(root.querySelectorAll('.cl-bot_message')).some((bubble) => bubble.textContent?.includes('We open at 9.'));
    })).toBe(true);
    await waitPastFocusTimer(page);
    await page.keyboard.type('ets');

    expect(await pageFocus(page)).toBe('search');
    expect(await page.inputValue('#search')).toBe('Tickets');
  });

  test('the launcher moves the focus to the input', async ({ page }) => {
    await loadWidget(page, { show_closed_widget_hint: 'false' });
    // Focus is setup only. The keyboard opens the chat.
    await page.evaluate(() => {
      window.__widgetRoots.get(document.querySelector('punku-chat')!)!.querySelector<HTMLButtonElement>('.cl-trigger')!.focus();
    });
    await page.keyboard.press('Enter');

    await waitForInputFocus(page, { fromWidget: true });
  });
});

test('the open window fades and rises on every screen, and only that animates', async ({ page }) => {
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false' });
  await expect.poll(async () => (await state(page)).windowOpacity).toBe(1);
  // Phones and short landscape screens follow the visible area at once: the
  // window position and size never animate, the fade and the rise do.
  const properties = (await state(page)).windowTransitionProperty.split(',').map((name) => name.trim());
  expect(properties).toEqual(expect.arrayContaining(['opacity', 'transform']));
  expect(properties.filter((name) => !['opacity', 'transform', 'visibility'].includes(name))).toEqual([]);
});

test('the message list is a named log', async ({ page }) => {
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', default_language: 'de' });
  await expect.poll(async () => (await state(page)).listRole).toBe('log');
  expect((await state(page)).listLabel).toBe('Unterhaltung');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the window and the messages do not animate', async ({ page }) => {
    await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false' });
    await expect.poll(async () => (await state(page)).messageAnimation).not.toBeNull();
    const result = await state(page);
    expect(result.windowTransition.split(',').every((duration) => parseFloat(duration) === 0)).toBe(true);
    expect(result.messageAnimation).toBe('none');
  });
});
