import { expect, Page, test } from '@playwright/test';
import { activate, loadWidget } from './widget-helpers';

// The header is one row: the avatar, the title with "Powered by" under it, and
// the actions on the right. The composer is a bordered field with the arrow-up
// send button inside, and the AI notice (EU AI Act, Article 50) sits under it.

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function openChat(page: Page, props: Record<string, string> = {}) {
  await loadWidget(page, {
    start_open: 'true', show_closed_widget_hint: 'false', width: '380', height: '600', ...props,
  });
  await expect.poll(async () => (await parts(page))?.field).toBeTruthy();
}

function parts(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!);
    const box = (selector: string) => {
      const element = root?.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height };
    };
    const send = root?.querySelector<HTMLButtonElement>('.cl-send-button');
    const notice = root?.querySelector<HTMLElement>('.cl-ai-notice');
    return {
      window: box('.cl-window'),
      header: box('.cl-header'),
      title: box('.cl-header-title'),
      subtitle: box('.cl-header-subtitle'),
      statusCut: (() => {
        const status = root?.querySelector<HTMLElement>('.cl-header-status');
        return status ? status.scrollHeight > status.clientHeight + 1 || status.scrollWidth > status.clientWidth + 1 : null;
      })(),
      newChat: box('.cl-new-session-btn'),
      field: box('.cl-composer-field'),
      send: box('.cl-send-button'),
      noticeBox: box('.cl-ai-notice'),
      notice: notice?.textContent ?? null,
      noticeColor: notice ? getComputedStyle(notice).color : null,
      sendLabel: send?.getAttribute('aria-label') ?? null,
      sendDisabled: send?.disabled ?? null,
      arrowIcon: !!send?.querySelector('svg.lucide-arrow-up'),
      fieldValue: root?.querySelector<HTMLTextAreaElement>('.cl-input-element')?.value ?? null,
      containerBackground: (() => {
        const container = root?.querySelector<HTMLElement>('.cl-input_container');
        return container ? getComputedStyle(container).backgroundColor : null;
      })(),
    };
  });
}

async function focusField(page: Page) {
  await page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    root.querySelector<HTMLTextAreaElement>('.cl-input-element')!.focus({ preventScroll: true });
  });
}

test('the header is one row with the title, "Powered by" and the actions', async ({ page }) => {
  await openChat(page);
  const result = (await parts(page))!;
  // One status line, or two on a narrow phone: the branding is never cut off.
  expect(result.statusCut).toBe(false);
  expect(result.header!.height).toBeLessThanOrEqual(result.subtitle!.height > 20 ? 84 : 68);
  // The title and the status line sit inside the header, the status under the title.
  expect(result.title!.top).toBeGreaterThanOrEqual(result.header!.top);
  expect(result.subtitle!.bottom).toBeLessThanOrEqual(result.header!.bottom);
  expect(result.subtitle!.top).toBeGreaterThanOrEqual(result.title!.bottom - 1);
  // The new-chat action sits at the right end of the same row.
  expect(result.newChat!.right).toBeGreaterThan(result.title!.right);
  expect(result.newChat!.top).toBeGreaterThanOrEqual(result.header!.top);
  expect(result.newChat!.bottom).toBeLessThanOrEqual(result.header!.bottom);
});

test('a long status wraps to a second line instead of losing its end', async ({ page }) => {
  // Trainingsbergwerk's status line. On a 320px phone it needs two lines.
  await openChat(page, { online_message: 'Dein KI-Assistent für das Trainingsbergwerk' });
  const result = (await parts(page))!;
  expect(result.statusCut).toBe(false);
  expect(result.subtitle!.bottom).toBeLessThanOrEqual(result.header!.bottom);
  expect(result.newChat!.bottom).toBeLessThanOrEqual(result.header!.bottom);
});

test('brand names in the status never break, also on a host page with hyphenation', async ({ page }) => {
  // Bootsverleih: a German host page with hyphens: auto split "booking-kit".
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.lang = 'de';
      const style = document.createElement('style');
      style.textContent = 'html { -webkit-hyphens: auto; hyphens: auto; }';
      document.head.appendChild(style);
    });
  });
  await openChat(page, { branding: 'punku-ai-bookingkit' });
  // Where a line breaks depends on the header width and on each engine's
  // hyphenation dictionary, so check the rules that prevent the break.
  const status = await page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const element = root.querySelector<HTMLElement>('.cl-header-status')!;
    const style = getComputedStyle(element) as CSSStyleDeclaration & { webkitHyphens?: string };
    return {
      hostHyphens: getComputedStyle(document.documentElement).hyphens || (getComputedStyle(document.documentElement) as CSSStyleDeclaration & { webkitHyphens?: string }).webkitHyphens,
      hyphens: style.hyphens || style.webkitHyphens,
      links: Array.from(element.querySelectorAll<HTMLElement>('a'))
        .map((link) => ({ text: link.textContent, whiteSpace: getComputedStyle(link).whiteSpace })),
    };
  });
  expect(status.hostHyphens).toBe('auto');
  expect(status.hyphens).toBe('manual');
  expect(status.links).toEqual([
    { text: 'PUNKU.AI', whiteSpace: 'nowrap' },
    { text: 'bookingkit', whiteSpace: 'nowrap' },
  ]);
  expect((await parts(page))!.statusCut).toBe(false);
});

test('the AI notice sits under the field in the chat language', async ({ page }) => {
  await openChat(page, { default_language: 'de' });
  const result = (await parts(page))!;
  expect(result.notice).toBe('Sie chatten mit einem KI-Assistenten. Antworten können Fehler enthalten.');
  expect(result.noticeBox!.top).toBeGreaterThanOrEqual(result.field!.bottom);
  expect(result.noticeBox!.bottom).toBeLessThanOrEqual(result.window!.bottom + 1);
  // A muted colour that still reads on the white composer: #64748b.
  expect(result.noticeColor).toBe('rgb(100, 116, 139)');
});

test('a site can word the AI notice or hide it', async ({ page }) => {
  await openChat(page, { ai_notice_text: 'Our assistant is an AI. Please check important details.' });
  expect((await parts(page))!.notice).toBe('Our assistant is an AI. Please check important details.');

  await openChat(page, { show_ai_notice: 'false' });
  expect((await parts(page))!.notice).toBeNull();
});

test('the arrow-up send button sits in the field and needs text', async ({ page }) => {
  await openChat(page);
  const empty = (await parts(page))!;
  expect(empty.arrowIcon).toBe(true);
  expect(empty.sendLabel).toBe('Send message');
  expect(empty.sendDisabled).toBe(true);
  expect(empty.send!.left).toBeGreaterThanOrEqual(empty.field!.left);
  expect(empty.send!.right).toBeLessThanOrEqual(empty.field!.right);
  expect(empty.send!.bottom).toBeLessThanOrEqual(empty.field!.bottom);

  await focusField(page);
  await page.keyboard.type('Is the museum open on Monday?');
  await expect.poll(async () => (await parts(page))!.sendDisabled).toBe(false);
});

test('a new conversation starts with an empty field', async ({ page, hasTouch }) => {
  await openChat(page);
  await focusField(page);
  await page.keyboard.type('A draft for the old conversation');
  await expect.poll(async () => (await parts(page))!.fieldValue).toBe('A draft for the old conversation');

  await activate(page, '.cl-new-session-btn', hasTouch);
  await activate(page, '.cl-modal-btn-confirm', hasTouch);
  await expect.poll(async () => (await parts(page))!.fieldValue).toBe('');
});

test('input_container_style keeps its background next to button_color', async ({ page }) => {
  await openChat(page, { button_color: '#7c2d12', input_container_style: JSON.stringify({ backgroundColor: '#fafaf9' }) });
  expect((await parts(page))!.containerBackground).toBe('rgb(250, 250, 249)');
});
