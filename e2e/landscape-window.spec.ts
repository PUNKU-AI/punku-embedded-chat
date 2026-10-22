import { expect, Page, test } from '@playwright/test';
import {
  hostCorner, loadWidget, panToLayoutCorner, partsOutsideScreen, waitForInputFocus,
  waitForSettledBoxes, widenHostPage,
} from './widget-helpers';

// Issue #77. Short landscape screens, 641-1023 px wide and at most 500 px
// tall, used the 641-767 px or the 768-1023 px layout. The window rose above
// the screen, and a large bottom_offset (285 px on live pages) left no room
// for it. The window now fills the visible height beside the trigger.

const widgetId = 'browser-fixture';
const parts = ['.cl-chat-window', '.cl-close-btn', '.cl-send-button', '.cl-trigger'];
// Header, one message line and input.
const minimumWindowHeight = 240;
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

type Box = { left: number; top: number; right: number; bottom: number };

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
      screen: {
        left: viewport.offsetLeft,
        top: viewport.offsetTop,
        right: viewport.offsetLeft + viewport.width,
        bottom: viewport.offsetTop + viewport.height,
      },
      window: box('.cl-chat-window'),
      trigger: box('.cl-trigger'),
      messages: box('.cl-messages_container'),
      lastMessage: box('.cl-bot_message'),
      inline: { left: chatWindow.style.left, top: chatWindow.style.top },
    };
  });
}

function overlaps(first: Box, second: Box) {
  return first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;
}

async function openWindow(page: Page, props: Record<string, string> = {}) {
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', ...props });
  await waitForInputFocus(page);
}

async function expectWindowBesideTrigger(page: Page, bottomOffset = 20) {
  await waitForSettledBoxes(page, parts);
  expect(await partsOutsideScreen(page, parts)).toEqual([]);

  const view = await boxes(page);
  expect(overlaps(view.window, view.trigger)).toBe(false);
  // 12 px between the window and the trigger, on the inner side of the trigger.
  const gap = view.trigger.left >= view.window.right
    ? view.trigger.left - view.window.right
    : view.window.left - view.trigger.right;
  expect(Math.round(gap)).toBe(12);

  // The window starts 8 px below the top of the visible area. Its bottom is
  // bottom_offset above the visible bottom while the window keeps its minimum
  // height. Else the window keeps the minimum height and ends lower.
  const top = view.window.top - view.screen.top;
  const bottomGap = view.screen.bottom - view.window.bottom;
  expect(Math.round(top)).toBe(8);
  const room = view.screen.bottom - view.screen.top - 8 - bottomOffset;
  if (room >= minimumWindowHeight) {
    expect(Math.round(bottomGap)).toBe(bottomOffset);
  } else {
    expect(Math.round(view.window.bottom - view.window.top)).toBe(minimumWindowHeight);
  }
  return view;
}

test.describe('Short landscape screen', () => {
  test.beforeEach(({ viewport }) => {
    test.skip(!viewport || viewport.width < 641 || viewport.width > 1023 || viewport.height > 500,
      'Only screens 641-1023 px wide and at most 500 px tall use the short landscape layout.');
  });

  for (const position of ['bottom-right', 'top-right', 'bottom-left', 'top-left'] as const) {
    test(`the ${position} window fills the height beside the trigger`, async ({ page }) => {
      await openWindow(page, { chat_position: position });
      const view = await expectWindowBesideTrigger(page);
      const triggerOnRight = position.endsWith('-right');
      expect(view.trigger.left >= view.window.right).toBe(triggerOnRight);
    });
  }

  test('bottom_offset keeps the window bottom level with the trigger', async ({ page }) => {
    await openWindow(page, { bottom_offset: '60' });
    const view = await expectWindowBesideTrigger(page, 60);
    expect(Math.round(view.trigger.bottom)).toBe(Math.round(view.window.bottom));
  });

  test('a large bottom_offset keeps the header, one message line and the input', async ({ page }) => {
    // Live pages use bottom_offset 285. On main the window was above the screen.
    await openWindow(page, { bottom_offset: '285' });
    const view = await expectWindowBesideTrigger(page, 285);
    expect(view.lastMessage.top).toBeGreaterThanOrEqual(view.messages.top - 0.5);
    expect(view.lastMessage.bottom).toBeLessThanOrEqual(view.messages.bottom + 0.5);
  });

  test('the gap follows the rendered trigger size', async ({ page }) => {
    // The CSS trigger size is max(48px, 3rem). chat_trigger_style can change it.
    await openWindow(page, { chat_trigger_style: JSON.stringify({ width: '72px', height: '72px' }) });
    const view = await expectWindowBesideTrigger(page);
    expect(Math.round(view.trigger.right - view.trigger.left)).toBe(72);
  });

  test('setTriggerPosition keeps the anchored window place on the screen', async ({ page }) => {
    await openWindow(page);
    expect(await page.evaluate((widgetId) => {
      const api = (window as unknown as Record<string, { setTriggerPosition(position: unknown): boolean }>)[`${widgetId}_api`];
      return api.setTriggerPosition({ x: 24, y: 120 });
    }, widgetId)).toBe(true);

    // The short landscape layout must not move the window that the trigger anchors.
    await waitForSettledBoxes(page, parts);
    const { window: box, inline } = await boxes(page);
    expect(`${Math.round(box.left)}px ${Math.round(box.top)}px`).toBe(`${inline.left} ${inline.top}`);
    expect(await partsOutsideScreen(page, parts)).toEqual([]);
  });
});

for (const viewport of [{ width: 740, height: 360 }, { width: 844, height: 390 }]) {
  test.describe(`Chromium phone in landscape, ${viewport.width} x ${viewport.height}`, () => {
    // Only Chromium phones grow the layout viewport on a wide host page. The
    // window must follow the visible area, not the layout viewport.
    test.use({ viewport });

    test.beforeEach(({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'android', 'The android profile runs the Chromium landscape case.');
    });

    for (const bottomOffset of [20, 285]) {
      test(`the window stays beside the trigger on a wide host page, bottom_offset ${bottomOffset}`, async ({ page }) => {
        await widenHostPage(page, hostCorner);
        await openWindow(page, { bottom_offset: String(bottomOffset) });
        await expectWindowBesideTrigger(page, bottomOffset);

        await panToLayoutCorner(page);
        await expectWindowBesideTrigger(page, bottomOffset);
      });
    }
  });
}
