import { test, expect, Page } from '@playwright/test';
import { activate, elementState, loadWidget } from './widget-helpers';

// Host pages often embed a floating WhatsApp button in the same corner as the
// widget. Such buttons use high z-index values, for example 99999999. The host
// page adds them after the widget, so equal values would also favor them. The
// widget must stay on top, closed and open. The main banners of large cookie
// consent tools must still cover it. Cookiebot uses the lowest value of them.
const whatsApp = `
  <a id="whatsapp-button" href="#whatsapp" aria-label="WhatsApp"
     style="position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;background:#25d366;z-index:99999999"></a>
  <div id="whatsapp-greeting"
       style="position:fixed;right:20px;bottom:90px;width:280px;height:160px;background:#fff;z-index:99999999">Chat with us on WhatsApp.</div>`;
const consentBanner = `
  <div id="consent-banner"
       style="position:fixed;left:0;right:0;bottom:0;height:120px;background:#222;color:#fff;z-index:2147483631">We use cookies.</div>`;

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const pageErrors: string[] = [];
  errors.set(page, pageErrors);
  page.on('pageerror', (error) => pageErrors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function injectHostElements(page: Page, html: string) {
  // Insert after the fixture script, so the host elements follow the widget.
  await page.route(/\/fixture\.html(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('</body>', `${html}</body>`);
    await route.fulfill({ response, body });
  });
}

type Box = { x: number; y: number; width: number; height: number };

// The trigger and window animate in. Wait until two reads agree.
async function settledBox(page: Page, selector: string): Promise<Box> {
  let previous = '';
  let current = '';
  await expect.poll(async () => {
    previous = current;
    const state = await elementState(page, selector);
    current = state && state.visibility === 'visible' && state.opacity === 1
      ? JSON.stringify({ x: state.x, y: state.y, width: state.width, height: state.height })
      : '';
    return current !== '' && current === previous;
  }, { message: `${selector} must settle` }).toBe(true);
  return JSON.parse(current) as Box;
}

const center = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

// The id of the topmost page element at a point. The closed shadow root hides
// the widget internals, so a widget hit returns its host, punku-chat.
async function topmostAt(page: Page, point: { x: number; y: number }) {
  return page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return hit?.id || hit?.localName || null;
  }, point);
}

async function hostBox(page: Page, id: string): Promise<Box> {
  return page.evaluate((id) => {
    const { x, y, width, height } = document.getElementById(id)!.getBoundingClientRect();
    return { x, y, width, height };
  }, id);
}

function overlap(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return { x, y, width, height };
}

async function widgetZIndex(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!.querySelector<HTMLElement>('.cl-widget-root')!;
    return getComputedStyle(root).zIndex;
  });
}

test('the widget stays above a WhatsApp button, closed and open', async ({ page, hasTouch }) => {
  await injectHostElements(page, whatsApp);
  await loadWidget(page, { show_closed_widget_hint: 'false' });

  const trigger = await settledBox(page, '.cl-trigger');
  const whatsAppButton = await hostBox(page, 'whatsapp-button');
  expect(overlap(trigger, whatsAppButton).width).toBeGreaterThan(0);
  expect(await topmostAt(page, center(trigger))).toBe('punku-chat');

  // A real click or tap. Playwright fails it if another element takes the input.
  await activate(page, '.cl-trigger', hasTouch);
  const chatWindow = await settledBox(page, '.cl-chat-window');
  expect(await topmostAt(page, center(await settledBox(page, '.cl-trigger')))).toBe('punku-chat');

  // The open window covers the WhatsApp greeting where the two overlap.
  const covered = overlap(chatWindow, await hostBox(page, 'whatsapp-greeting'));
  expect(covered.width).toBeGreaterThan(0);
  expect(covered.height).toBeGreaterThan(0);
  expect(await topmostAt(page, center(covered))).toBe('punku-chat');

  // Inside the widget, the window stays above the trigger layer.
  const insideHit = await page.evaluate(({ x, y }) => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    return !!root.elementFromPoint(x, y)?.closest('.cl-chat-window');
  }, center(covered));
  expect(insideHit).toBe(true);
});

test('a Cookiebot-level consent banner still covers the widget', async ({ page }) => {
  await injectHostElements(page, consentBanner);
  await loadWidget(page, { show_closed_widget_hint: 'false' });

  const trigger = await settledBox(page, '.cl-trigger');
  expect(await topmostAt(page, center(trigger))).toBe('consent-banner');
});

// The widget rounds and clamps z_index. 1e21 is invalid CSS (1e+21), and the
// browser would compute auto. A negative value would hide the trigger.
for (const { zIndex, computed, topmost } of [
  { zIndex: '100000000', computed: '100000000', topmost: 'punku-chat' },
  { zIndex: '1000', computed: '1000', topmost: 'whatsapp-button' },
  { zIndex: '1e21', computed: '2147483647', topmost: 'punku-chat' },
  { zIndex: '-5', computed: '0', topmost: 'whatsapp-button' },
]) {
  test(`z_index ${zIndex} puts ${topmost} on top`, async ({ page }) => {
    await injectHostElements(page, whatsApp);
    await loadWidget(page, { show_closed_widget_hint: 'false', z_index: zIndex });

    expect(await widgetZIndex(page)).toBe(computed);
    const trigger = await settledBox(page, '.cl-trigger');
    expect(await topmostAt(page, center(trigger))).toBe(topmost);
  });
}

test('a relocation zIndex of 1e21 is clamped like z_index', async ({ page }) => {
  await injectHostElements(page, whatsApp);
  await loadWidget(page, { show_closed_widget_hint: 'false', z_index: '1000' });

  // Move the trigger onto the WhatsApp button.
  const whatsAppButton = await hostBox(page, 'whatsapp-button');
  const position = { x: Math.round(whatsAppButton.x + 6), y: Math.round(whatsAppButton.y + 6), zIndex: 1e21 };
  expect(await page.evaluate((position) => {
    const api = (window as unknown as Record<string, { setTriggerPosition(position: unknown): boolean }>)['browser-fixture_api'];
    return api.setTriggerPosition(position);
  }, position)).toBe(true);

  await expect.poll(() => widgetZIndex(page)).toBe('2147483647');
  const trigger = await settledBox(page, '.cl-trigger');
  expect(overlap(trigger, whatsAppButton).width).toBeGreaterThan(0);
  expect(await topmostAt(page, center(trigger))).toBe('punku-chat');
});
