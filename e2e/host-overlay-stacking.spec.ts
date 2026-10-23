import { test, expect, Page } from '@playwright/test';

declare global {
  interface Window {
    __widgetRoots: WeakMap<Element, ShadowRoot>;
  }
}

// The Eyeable accessibility button of the Swarovski page: fixed at the
// highest z-index, 20 px from the right and 140 px from the bottom. The page
// adds it after the widget, so an equal z-index would also favor it. No
// z-index can cover it, so the open window goes to the browser's top layer.
const eyeable = `
  <button id="eyeable-trigger" aria-label="Accessibility"
          style="position:fixed;right:20px;bottom:140px;width:60px;height:60px;border:0;border-radius:50%;background:#1a73e8;z-index:2147483647"></button>`;
// A consent dialog must still cover the open window. Borlabs Cookie marks
// its dialog as modal, in a layer at 999999.
const consentDialog = `
  <div id="consent-layer" style="position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.4)">
    <div role="alertdialog" aria-modal="true" aria-label="Privacy settings"
         style="margin:40px auto;width:260px;padding:16px;background:#fff">We use cookies.</div>
  </div>`;
// Usercentrics on the Swarovski page: the banner is in the open shadow root
// of aside#usercentrics-cmp-ui, in a layer at 2147483646.
const usercentrics = `
  <aside id="usercentrics-cmp-ui"></aside>
  <script>
    document.getElementById('usercentrics-cmp-ui').attachShadow({ mode: 'open' }).innerHTML =
      '<div style="position:fixed;left:0;right:0;bottom:0;height:70%;z-index:2147483646;background:#fff">' +
      '<div id="uc-main-dialog" role="dialog" class="cmp first bottom mobile ltr gdpr" style="height:100%">We use cookies.</div></div>';
  </script>`;

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const pageErrors: string[] = [];
  errors.set(page, pageErrors);
  page.on('pageerror', (error) => pageErrors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function loadWidget(page: Page, hostHtml: string, props: Record<string, string> = {}) {
  // Record the shadow roots without changing their mode. An open root would
  // hide a closed-root regression.
  await page.addInitScript(() => {
    window.__widgetRoots = new WeakMap();
    const attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      const root = attachShadow.call(this, options);
      window.__widgetRoots.set(this, root);
      return root;
    };
  });
  // Keep the test local.
  await page.context().route(/https?:\/\//, (route) => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    return route.abort();
  });
  // Insert the host elements after the fixture script, so they follow the widget.
  await page.route(/\/fixture\.html(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('</body>', `${hostHtml}</body>`);
    await route.fulfill({ response, body });
  });
  await page.goto('/fixture.html?' + new URLSearchParams(props));
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat');
    return !!host && !!window.__widgetRoots.get(host)?.querySelector('.cl-chat-window');
  })).toBe(true);
  expect(await page.evaluate(() => document.querySelector('punku-chat')!.shadowRoot)).toBeNull();
}

// The page's own chat button calls the widget API: the trigger is hidden.
async function openWindow(page: Page) {
  await page.evaluate(() => (window as unknown as Record<string, { open: () => void }>)['browser-fixture_api'].open());
}

async function closeWindow(page: Page) {
  await page.evaluate(() => (window as unknown as Record<string, { close: () => void }>)['browser-fixture_api'].close());
}

type Box = { x: number; y: number; width: number; height: number };

// The open window scales in. Wait until two reads of the open window agree.
async function settledWindow(page: Page): Promise<Box> {
  let previous = '';
  let current = '';
  await expect.poll(async () => {
    previous = current;
    current = await page.evaluate(() => {
      const host = document.querySelector('punku-chat')!;
      const chatWindow = window.__widgetRoots.get(host)!.querySelector('.cl-chat-window')!;
      if (!chatWindow.classList.contains('cl-scale-100')) return '';
      const { x, y, width, height } = chatWindow.getBoundingClientRect();
      return width > 0 && height > 0 ? JSON.stringify({ x, y, width, height }) : '';
    });
    return current !== '' && current === previous;
  }, { message: 'The open window must settle' }).toBe(true);
  return JSON.parse(current) as Box;
}

async function windowPopover(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const layer = window.__widgetRoots.get(host)!.querySelector('.cl-window-layer');
    return layer ? layer.getAttribute('popover') : 'no window layer';
  });
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

test('the open window covers an accessibility button at the highest z-index', async ({ page }) => {
  await loadWidget(page, eyeable);
  const button = await hostBox(page, 'eyeable-trigger');
  expect(await topmostAt(page, center(button))).toBe('eyeable-trigger');

  await openWindow(page);
  const covered = overlap(await settledWindow(page), button);
  expect(covered.width).toBeGreaterThan(0);
  expect(covered.height).toBeGreaterThan(0);
  expect(await topmostAt(page, center(covered))).toBe('punku-chat');
  expect(await windowPopover(page)).toBe('manual');

  // Closed, the window leaves the top layer: the button works again.
  await closeWindow(page);
  await expect.poll(() => windowPopover(page)).toBeNull();
  await expect.poll(() => topmostAt(page, center(button))).toBe('eyeable-trigger');
});

test('a window that starts open also covers the accessibility button', async ({ page }) => {
  await loadWidget(page, eyeable, { start_open: 'true' });
  const covered = overlap(await settledWindow(page), await hostBox(page, 'eyeable-trigger'));
  expect(covered.width).toBeGreaterThan(0);
  expect(await topmostAt(page, center(covered))).toBe('punku-chat');
});

test('a consent dialog still covers the open window', async ({ page }) => {
  await loadWidget(page, consentDialog + eyeable);
  await openWindow(page);
  const chatWindow = await settledWindow(page);
  expect(await windowPopover(page)).toBeNull();
  expect(await topmostAt(page, center(chatWindow))).toBe('consent-layer');
});

test('a consent banner in an open shadow root still covers the open window (Usercentrics)', async ({ page }) => {
  await loadWidget(page, usercentrics + eyeable);
  await openWindow(page);
  const chatWindow = await settledWindow(page);
  const shared = overlap(chatWindow, await page.evaluate(() => {
    const dialog = document.getElementById('usercentrics-cmp-ui')!.shadowRoot!.getElementById('uc-main-dialog')!;
    const { x, y, width, height } = dialog.getBoundingClientRect();
    return { x, y, width, height };
  }));
  expect(shared.height).toBeGreaterThan(0);
  expect(await windowPopover(page)).toBeNull();
  expect(await topmostAt(page, center(shared))).toBe('usercentrics-cmp-ui');
});

test('the open window goes to the top layer when the consent dialog closes', async ({ page }) => {
  await loadWidget(page, consentDialog + eyeable);
  await openWindow(page);
  const chatWindow = await settledWindow(page);
  const covered = overlap(chatWindow, await hostBox(page, 'eyeable-trigger'));
  // While the dialog is visible, the window stays in the page: below the
  // dialog and below the button.
  expect(await topmostAt(page, center(chatWindow))).toBe('consent-layer');
  expect(await topmostAt(page, center(covered))).toBe('eyeable-trigger');

  // The visitor answers the dialog. The widget checks once a second.
  await page.evaluate(() => document.getElementById('consent-layer')!.remove());
  await expect.poll(() => topmostAt(page, center(covered))).toBe('punku-chat');
  expect(await windowPopover(page)).toBe('manual');
});
