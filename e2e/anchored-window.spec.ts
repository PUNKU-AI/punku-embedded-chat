import { expect, Page, test } from '@playwright/test';
import { loadWidget, waitForInputFocus } from './widget-helpers';

// After setTriggerPosition, the window opens next to the moved trigger. From
// 641 to 1023 px wide, the CSS gave the window a larger size than the box
// that the placement used, so the window reached past the screen on tablets
// and landscape phones (#77, Related).

const widgetId = 'browser-fixture';
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page, viewport }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  test.skip(!viewport || viewport.width <= 640, 'The phone layout fills the screen and ignores the trigger position.');
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

type Box = { left: number; top: number; right: number; bottom: number };

async function boxes(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const box = (selector: string) => {
      const rect = root.querySelector(selector)!.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    const chatWindow = root.querySelector<HTMLElement>('.cl-chat-window')!;
    return {
      screen: { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
      window: box('.cl-chat-window'),
      close: box('.cl-close-btn'),
      send: box('.cl-send-button'),
      trigger: box('.cl-trigger'),
      inline: { left: chatWindow.style.left, top: chatWindow.style.top },
      moving: chatWindow.getAnimations().length > 0,
    };
  });
}

function outside(name: string, box: Box, screen: Box) {
  // Allow half a pixel for rounding.
  const inside = box.left >= screen.left - 0.5 && box.top >= screen.top - 0.5 &&
    box.right <= screen.right + 0.5 && box.bottom <= screen.bottom + 0.5;
  return inside ? [] : [`${name} x ${Math.round(box.left)}-${Math.round(box.right)}, y ${Math.round(box.top)}-${Math.round(box.bottom)}`];
}

// The distance between two boxes. 0 means that they overlap.
function gap(first: Box, second: Box) {
  return Math.max(second.left - first.right, first.left - second.right, second.top - first.bottom, first.top - second.bottom, 0);
}

async function moveTrigger(page: Page, position: { x: number; y: number }) {
  expect(await page.evaluate(({ widgetId, position }) => {
    const api = (window as unknown as Record<string, { setTriggerPosition(position: unknown): boolean }>)[`${widgetId}_api`];
    return api.setTriggerPosition(position);
  }, { widgetId, position })).toBe(true);
  return settledBoxes(page, position);
}

async function settledBoxes(page: Page, position: { x: number; y: number }) {
  // The window moves and resizes with a 300 ms transition. Read the boxes
  // only when no transition runs, the rendered window is at its inline place
  // and the trigger is at the position.
  await expect.poll(async () => {
    const view = await boxes(page);
    return `${view.moving ? 'moving' : 'settled'}, ` +
      `rendered ${Math.round(view.window.left)}px ${Math.round(view.window.top)}px, ` +
      `inline ${view.inline.left} ${view.inline.top}, ` +
      `trigger ${Math.round(view.trigger.left)} ${Math.round(view.trigger.top)}`;
  }).toMatch(new RegExp(`^settled, rendered (\\d+px) (\\d+px), inline \\1 \\2, trigger ${position.x} ${position.y}$`));
  return boxes(page);
}

async function resizeScreen(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  // setViewportSize can return before the page sees the new size (Linux
  // WebKit in CI). Until then, the old box looks settled. Wait for the new
  // size, then for two frames: the widget places the window again in the
  // frame after the resize event, and the move starts in the next frame.
  await expect.poll(() => page.evaluate(() => `${window.innerWidth} x ${window.innerHeight}`))
    .toBe(`${size.width} x ${size.height}`);
  await page.evaluate(() => new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  }));
}

function rounded(box: Box) {
  return { left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom) };
}

function expectNextToTrigger(view: Awaited<ReturnType<typeof boxes>>) {
  expect([
    ...outside('window', view.window, view.screen),
    ...outside('close X', view.close, view.screen),
    ...outside('send button', view.send, view.screen),
    ...outside('trigger', view.trigger, view.screen),
  ]).toEqual([]);
  // Next to the trigger: 32 px above or below it, or 12 px beside it.
  const distance = Math.round(gap(view.window, view.trigger));
  expect(distance).toBeGreaterThanOrEqual(12);
  expect(distance).toBeLessThanOrEqual(32);
}

// The close X shows on desktop too, so the tests can check it everywhere.
const openWindowProps = { start_open: 'true', show_closed_widget_hint: 'false', show_close_button_on_desktop: 'true' };

for (const triggerSize of [48, 72]) {
  test(`the anchored window stays on the screen next to a ${triggerSize} px trigger in every quadrant`, async ({ page, viewport }) => {
    // Customers can change the trigger size with chat_trigger_style.
    const triggerStyle: Record<string, string> = triggerSize === 48
      ? {}
      : { chat_trigger_style: JSON.stringify({ width: `${triggerSize}px`, height: `${triggerSize}px` }) };
    await loadWidget(page, { ...openWindowProps, ...triggerStyle });
    await waitForInputFocus(page);
    // 24 px from each corner of the screen.
    const right = viewport!.width - 24 - triggerSize;
    const bottom = viewport!.height - 24 - triggerSize;
    const quadrants = {
      'top-left': { x: 24, y: 24 },
      'top-right': { x: right, y: 24 },
      'bottom-left': { x: 24, y: bottom },
      'bottom-right': { x: right, y: bottom },
    };

    for (const [quadrant, position] of Object.entries(quadrants)) {
      await test.step(`trigger in the ${quadrant} quadrant at ${position.x}, ${position.y}`, async () => {
        const view = await moveTrigger(page, position);
        expect(Math.round(view.trigger.right - view.trigger.left)).toBe(triggerSize);
        expectNextToTrigger(view);
      });
    }
  });
}

test('the anchored window follows a resize and a rotation', async ({ page, viewport }) => {
  await loadWidget(page, openWindowProps);
  await waitForInputFocus(page);
  const position = { x: 24, y: 24 };
  await moveTrigger(page, position);
  const { width, height } = viewport!;
  const screens = {
    // For example a browser toolbar or a split screen.
    'a shorter screen': { width, height: Math.round(height * 0.6) },
    'a rotated screen': { width: height, height: width },
  };

  for (const [name, size] of Object.entries(screens)) {
    await test.step(`${name}, ${size.width} x ${size.height}`, async () => {
      await resizeScreen(page, size);
      // The phone layout fills the screen and ignores the trigger position.
      if (size.width <= 640) return;

      const view = await settledBoxes(page, position);
      expectNextToTrigger(view);
      // The same box as a page that opens at this size.
      await page.reload();
      await waitForInputFocus(page);
      const fresh = await moveTrigger(page, position);
      expect(rounded(view.window)).toEqual(rounded(fresh.window));
    });
  }
});
