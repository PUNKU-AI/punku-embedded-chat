import { expect, Page, test } from '@playwright/test';
import { loadWidget, waitForInputFocus } from './widget-helpers';

// Issue #77. Short landscape phones use the 641-767 px layout. Its window was
// 75vh tall and sat 80 px above the trigger, so its top rose above the screen
// on every page. The window now fills the height beside the trigger.

const widgetId = 'browser-fixture';
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page, viewport }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  test.skip(!viewport || viewport.width < 641 || viewport.width > 767 || viewport.height > 500,
    'Only short screens 641-767 px wide use the landscape layout.');
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

type Box = { left: number; top: number; right: number; bottom: number };

async function openWindow(page: Page, props: Record<string, string> = {}) {
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', ...props });
  await waitForInputFocus(page);
}

async function boxes(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const viewport = window.visualViewport!;
    const box = (selector: string) => {
      const rect = root.querySelector(selector)!.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    const chatWindow = root.querySelector<HTMLElement>('.cl-chat-window')!;
    return {
      screen: { left: 0, top: 0, right: viewport.width, bottom: viewport.height },
      window: box('.cl-chat-window'),
      close: box('.cl-close-btn'),
      send: box('.cl-send-button'),
      trigger: box('.cl-trigger'),
      inline: { left: chatWindow.style.left, top: chatWindow.style.top },
    };
  });
}

function outside(name: string, box: Box, screen: Box) {
  // Allow half a pixel for rounding.
  const inside = box.left >= screen.left - 0.5 && box.top >= screen.top - 0.5 &&
    box.right <= screen.right + 0.5 && box.bottom <= screen.bottom + 0.5;
  return inside ? [] : [`${name} x ${Math.round(box.left)}-${Math.round(box.right)}, y ${Math.round(box.top)}-${Math.round(box.bottom)}`];
}

function overlaps(first: Box, second: Box) {
  return first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;
}

async function expectWindowBesideTrigger(page: Page, bottomOffset = 20) {
  // The open transition moves the window, so wait until it settles.
  await expect.poll(async () => {
    const view = await boxes(page);
    return [
      ...outside('window', view.window, view.screen),
      ...outside('close X', view.close, view.screen),
      ...outside('send button', view.send, view.screen),
      ...outside('trigger', view.trigger, view.screen),
      ...(overlaps(view.window, view.trigger) ? ['window covers the trigger'] : []),
    ];
  }).toEqual([]);

  // The window fills the height, from 8 px below the top to bottom_offset,
  // which is also the bottom edge of a trigger in a bottom corner.
  const view = await boxes(page);
  expect(Math.round(view.window.top)).toBe(8);
  expect(Math.round(view.window.bottom)).toBe(Math.round(view.screen.bottom - bottomOffset));
  return view;
}

for (const position of ['bottom-right', 'top-right'] as const) {
  test(`the ${position} window fits the screen to the left of the trigger`, async ({ page }) => {
    await openWindow(page, { chat_position: position });
    const view = await expectWindowBesideTrigger(page);
    expect(Math.round(view.trigger.left - view.window.right)).toBe(12);
  });
}

for (const position of ['bottom-left', 'top-left'] as const) {
  test(`the ${position} window fits the screen to the right of the trigger`, async ({ page }) => {
    await openWindow(page, { chat_position: position });
    const view = await expectWindowBesideTrigger(page);
    expect(Math.round(view.window.left - view.trigger.right)).toBe(12);
  });
}

test('bottom_offset keeps the window bottom level with the trigger', async ({ page }) => {
  await openWindow(page, { bottom_offset: '60' });
  const view = await expectWindowBesideTrigger(page, 60);
  expect(Math.round(view.trigger.bottom)).toBe(Math.round(view.window.bottom));
});

test('setTriggerPosition keeps the anchored window place', async ({ page }) => {
  await openWindow(page);
  expect(await page.evaluate((widgetId) => {
    const api = (window as unknown as Record<string, { setTriggerPosition(position: unknown): boolean }>)[`${widgetId}_api`];
    return api.setTriggerPosition({ x: 24, y: 120 });
  }, widgetId)).toBe(true);

  // The landscape layout must not move the window that the trigger anchors.
  await expect.poll(async () => {
    const { window: box, inline } = await boxes(page);
    return `rendered ${Math.round(box.left)}px ${Math.round(box.top)}px, inline ${inline.left} ${inline.top}`;
  }).toMatch(/^rendered 24px (\d+px), inline 24px \1$/);
});
