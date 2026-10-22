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

  // The window moves with a 300 ms transition. Read the boxes only when the
  // rendered window is at its inline place and the trigger at the position.
  await expect.poll(async () => {
    const view = await boxes(page);
    return `rendered ${Math.round(view.window.left)}px ${Math.round(view.window.top)}px, ` +
      `inline ${view.inline.left} ${view.inline.top}, ` +
      `trigger ${Math.round(view.trigger.left)} ${Math.round(view.trigger.top)}`;
  }).toMatch(new RegExp(`^rendered (\\d+px) (\\d+px), inline \\1 \\2, trigger ${position.x} ${position.y}$`));
  return boxes(page);
}

test('the anchored window stays on the screen next to the trigger in every quadrant', async ({ page, viewport }) => {
  // The close X shows on desktop too, so the test can check it everywhere.
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', show_close_button_on_desktop: 'true' });
  await waitForInputFocus(page);
  const { width, height } = viewport!;
  const quadrants = {
    'top-left': { x: 24, y: 24 },
    'top-right': { x: width - 72, y: 24 },
    'bottom-left': { x: 24, y: height - 72 },
    'bottom-right': { x: width - 72, y: height - 72 },
  };

  for (const [quadrant, position] of Object.entries(quadrants)) {
    await test.step(`trigger in the ${quadrant} quadrant at ${position.x}, ${position.y}`, async () => {
      const view = await moveTrigger(page, position);

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
    });
  }
});
