import { CDPSession, expect, Page, test } from '@playwright/test';
import { extendHostPage, loadWidget, waitForInputFocus } from './widget-helpers';

// Every control in the widget has a name that a screen reader reads (WCAG
// 4.1.2). A customer's checker read the Chrome accessibility tree, which also
// shows the closed shadow root. In v1.0.21 it found an unnamed launcher and an
// unnamed send button. The new-conversation dialog keeps the keyboard inside:
// Escape closes it first, and the focus goes back to the control that opened
// it. When the chat closes, the focus goes back to the page button that opened
// it.

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

// An answer with the controls an agent can write: links, an image link
// without alt text, a task list and a table.
const conversation: StoredMessage[] = [
  { message: 'What do I need?', isSend: true },
  {
    message: [
      'Bring these:',
      '',
      '- [ ] Towel',
      '- [x] Ticket',
      '',
      '| Day | Hours |',
      '| --- | --- |',
      '| Monday to Friday | 10:00 to 18:00 |',
      '',
      '[![](/plan.png)](/destination.html?source=plan)',
      '',
      'See [the prices](/destination.html?source=prices).',
    ].join('\n'),
    isSend: false,
    message_id: 'synthetic-answer',
  },
];

const INTERACTIVE = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'slider', 'spinbutton', 'listbox', 'option',
]);

// The interactive nodes of the accessibility tree inside <punku-chat>, as
// Chrome gives them to screen readers and to checkers that use CDP.
async function widgetControls(cdp: CDPSession) {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const controls: { role: string; name: string }[] = [];
  for (const node of nodes) {
    const role = node.role?.value as string | undefined;
    if (node.ignored || !role || !INTERACTIVE.has(role) || !node.backendDOMNodeId) continue;
    const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: node.backendDOMNodeId });
    const { result } = await cdp.send('Runtime.callFunctionOn', {
      objectId: object.objectId!,
      returnByValue: true,
      functionDeclaration: `function () {
        for (let node = this; node; node = node.parentNode || node.host || null) {
          if (node.localName === 'punku-chat') return true;
        }
        return false;
      }`,
    });
    if (result.value) controls.push({ role, name: String(node.name?.value ?? '').trim() });
  }
  return controls;
}

async function axSession(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
  return cdp;
}

function shadowFocus(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const focused = root.activeElement as HTMLElement | null;
    return focused ? focused.className : document.activeElement?.id || null;
  });
}

const windowVisibility = (page: Page) => page.evaluate(() => {
  const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
  return getComputedStyle(root.querySelector('.cl-chat-window')!).visibility;
});

const dialogShown = (page: Page) => page.evaluate(() => {
  const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
  return !!root.querySelector('.cl-modal');
});

// The dialog scrolls, and the focused button lies in its visible part.
const focusInDialogView = (page: Page) => page.evaluate(() => {
  const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
  const focused = root.activeElement as HTMLElement | null;
  const dialog = root.querySelector<HTMLElement>('.cl-modal');
  if (!focused || !dialog) return { scrolls: false, inView: false };
  const box = dialog.getBoundingClientRect();
  const target = focused.getBoundingClientRect();
  return {
    scrolls: dialog.scrollHeight > dialog.clientHeight,
    inView: target.top >= box.top - 1 && target.bottom <= box.bottom + 1,
  };
});

async function focusNewConversation(page: Page) {
  await page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    root.querySelector<HTMLButtonElement>('.cl-new-session-btn')!.focus({ preventScroll: true });
  });
  await expect.poll(() => shadowFocus(page)).toContain('cl-new-session-btn');
}

test.describe('the accessibility tree (Chromium, as the checker reads it)', () => {
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
    'CDP reads the accessibility tree in desktop Chromium.');

  test('every control has a name: closed, open with an answer, and in the dialog', async ({ page }) => {
    await storeConversation(page, conversation);
    await loadWidget(page, { default_language: 'de', width: '420', height: '640' });
    const cdp = await axSession(page);

    const closed = await widgetControls(cdp);
    expect(closed.filter((control) => !control.name)).toEqual([]);
    expect(closed).toEqual([{ role: 'button', name: 'Chat öffnen' }]);

    await page.evaluate(() => (window as unknown as Record<string, { open: () => void }>)['browser-fixture_api'].open());
    await waitForInputFocus(page);
    const open = await widgetControls(cdp);
    expect(open.filter((control) => !control.name)).toEqual([]);
    expect(open).toEqual(expect.arrayContaining([
      { role: 'button', name: 'Chat schließen' },
      { role: 'button', name: 'Neues Gespräch' },
      { role: 'checkbox', name: 'Towel' },
      { role: 'checkbox', name: 'Ticket' },
      { role: 'link', name: '127.0.0.1' },
      { role: 'link', name: 'the prices' },
      { role: 'button', name: 'Hilfreich' },
      { role: 'textbox', name: 'Ihre Nachricht' },
      { role: 'button', name: 'Nachricht senden' },
    ]));

    await focusNewConversation(page);
    await page.keyboard.press('Enter');
    await expect.poll(() => dialogShown(page)).toBe(true);
    const dialog = await widgetControls(cdp);
    expect(dialog.filter((control) => !control.name)).toEqual([]);
    const names = dialog.map((control) => control.name);
    expect(names).toEqual(expect.arrayContaining(['Schließen', 'Abbrechen', 'Ja, neu beginnen']));
    // The inert window behind the dialog leaves the tree.
    expect(names).not.toContain('Nachricht senden');
    expect(names).not.toContain('Neues Gespräch');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const alertDialog = nodes.find((node) => node.role?.value === 'alertdialog' && !node.ignored);
    expect(alertDialog?.name?.value).toBe('Neues Gespräch beginnen');
  });
});

test.describe('keyboard', () => {
  test.beforeEach(({ hasTouch }) => {
    test.skip(hasTouch, 'Keyboard input runs on the three desktop engines.');
  });

  test('the dialog takes the focus, keeps Tab inside, and Escape closes it before the chat', async ({ page }) => {
    await storeConversation(page, conversation);
    await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', width: '420', height: '640' });
    await waitForInputFocus(page);

    await focusNewConversation(page);
    await page.keyboard.press('Enter');
    await expect.poll(() => shadowFocus(page)).toContain('cl-modal-btn-cancel');

    await page.keyboard.press('Tab');
    await expect.poll(() => shadowFocus(page)).toContain('cl-modal-btn-confirm');
    await page.keyboard.press('Tab');
    await expect.poll(() => shadowFocus(page)).toContain('cl-modal-close');
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => shadowFocus(page)).toContain('cl-modal-btn-confirm');

    // The window behind the dialog takes no focus and no text.
    const inputTakesFocus = await page.evaluate(() => {
      const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
      const input = root.querySelector<HTMLTextAreaElement>('.cl-input-element')!;
      input.focus();
      return root.activeElement === input;
    });
    expect(inputTakesFocus).toBe(false);

    await page.keyboard.press('Escape');
    await expect.poll(() => dialogShown(page)).toBe(false);
    await expect.poll(() => shadowFocus(page)).toContain('cl-new-session-btn');
    expect(await windowVisibility(page)).toBe('visible');

    await page.keyboard.press('Escape');
    await expect.poll(() => windowVisibility(page)).toBe('hidden');
    await expect.poll(() => shadowFocus(page)).toContain('cl-trigger');
  });

  test('in a short window the dialog scrolls to the button that has the focus', async ({ page }) => {
    // 300 % zoom on a 1366 x 768 laptop: the phone layout in a short window.
    await page.setViewportSize({ width: 455, height: 217 });
    await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false' });
    await waitForInputFocus(page);
    await focusNewConversation(page);
    await page.keyboard.press('Enter');
    await expect.poll(() => shadowFocus(page)).toContain('cl-modal-btn-cancel');
    expect(await focusInDialogView(page)).toEqual({ scrolls: true, inView: true });

    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => shadowFocus(page)).toContain('cl-modal-close');
    await expect.poll(() => focusInDialogView(page)).toEqual({ scrolls: true, inView: true });

    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => shadowFocus(page)).toContain('cl-modal-btn-confirm');
    await expect.poll(() => focusInDialogView(page)).toEqual({ scrolls: true, inView: true });
  });

  test('a chat closed with the dialog open opens again without it', async ({ page }) => {
    await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', width: '420', height: '640' });
    await waitForInputFocus(page);
    await focusNewConversation(page);
    await page.keyboard.press('Enter');
    await expect.poll(() => dialogShown(page)).toBe(true);

    await page.evaluate(() => (window as unknown as Record<string, { close: () => void }>)['browser-fixture_api'].close());
    await expect.poll(() => windowVisibility(page)).toBe('hidden');
    await page.evaluate(() => (window as unknown as Record<string, { open: () => void }>)['browser-fixture_api'].open());
    await waitForInputFocus(page);

    expect(await dialogShown(page)).toBe(false);
  });

  test('the focus goes back to the page button that opened the chat', async ({ page }) => {
    await extendHostPage(page, '<button id="ask-button" type="button">Ask our assistant</button>');
    await loadWidget(page, { show_closed_widget_hint: 'false' });
    await page.evaluate(() => {
      document.getElementById('ask-button')!.addEventListener('click', () => {
        (window as unknown as Record<string, { open: () => void }>)['browser-fixture_api'].open();
      });
    });

    await page.focus('#ask-button');
    await page.keyboard.press('Enter');
    // The visitor's key press opened the chat: the widget moves the focus itself.
    await waitForInputFocus(page, { fromWidget: true });

    await page.keyboard.press('Escape');
    await expect.poll(() => windowVisibility(page)).toBe('hidden');
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('ask-button');
  });
});
