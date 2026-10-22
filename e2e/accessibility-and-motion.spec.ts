import { expect, Page, test } from '@playwright/test';
import { loadWidget } from './widget-helpers';

// Accessibility and motion. The launcher says what it does and whether the
// chat is open. The closed window leaves the tab order. Escape returns the
// focus to the launcher. The message list is a named log. Reduced motion
// turns the open fade and the message fade off.

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
  await expect.poll(async () => (await state(page)).focus).toContain('cl-input-element');

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).focus).toContain('cl-trigger');
  await expect.poll(async () => (await state(page)).windowVisibility).toBe('hidden');
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
