import { test, expect, Page } from '@playwright/test';
import { loadWidget } from './widget-helpers';

// Host pages can change the root font-size. Elementor kits often set
// html, body { font-size: 10px }, and many themes use html { font-size: 62.5% }.
// rem inside the widget's closed shadow root still follows that root.
// The widget must keep its designed geometry on every host.
const hosts = [
  { name: 'Elementor kit 10px', css: 'html, body { font-size: 10px; }', root: '10px' },
  { name: '62.5% root', css: 'html { font-size: 62.5%; }', root: '10px' },
  { name: '20px root', css: 'html { font-size: 20px; }', root: '20px' },
];

const measured = [
  '.cl-trigger', '.cl-trigger-icon.cl-scale-100', '.cl-chat-window', '.cl-window', '.cl-header',
  '.cl-messages_container', '.cl-bot_message', '.cl-input-element',
];

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const pageErrors: string[] = [];
  errors.set(page, pageErrors);
  page.on('pageerror', (error) => pageErrors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function geometry(page: Page) {
  return page.evaluate((selectors) => {
    const host = document.querySelector('punku-chat');
    const root = host && window.__widgetRoots.get(host);
    if (!root?.querySelector('.cl-trigger')) return null;
    const boxes: Record<string, unknown> = {};
    for (const selector of selectors) {
      const element = root.querySelector<HTMLElement>(selector);
      if (!element) {
        boxes[selector] = null;
        continue;
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      boxes[selector] = {
        width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10,
        padding: style.padding, radius: style.borderRadius, fontSize: style.fontSize,
      };
    }
    return { rootFontSize: getComputedStyle(document.documentElement).fontSize, boxes };
  }, measured);
}

async function settledGeometry(page: Page) {
  // The window opens with a transition. Wait until two reads agree.
  let previous = '';
  let current = '';
  await expect.poll(async () => {
    previous = current;
    current = JSON.stringify(await geometry(page));
    return current !== 'null' && current === previous;
  }).toBe(true);
  return JSON.parse(current) as NonNullable<Awaited<ReturnType<typeof geometry>>>;
}

for (const hostPage of hosts) {
  test(`${hostPage.name}: trigger keeps 48px`, async ({ page }) => {
    await page.route(/\/fixture\.html(\?|$)/, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace('</head>', `<style>${hostPage.css}</style></head>`);
      await route.fulfill({ response, body });
    });
    await loadWidget(page, { show_closed_widget_hint: 'false' });
    const closed = await settledGeometry(page);
    expect(closed.rootFontSize).toBe(hostPage.root);
    expect(closed.boxes['.cl-trigger']).toMatchObject({ width: 48, height: 48 });
    expect(closed.boxes['.cl-trigger-icon.cl-scale-100']).toMatchObject({ width: 24, height: 24 });
  });

  test(`${hostPage.name}: open window matches a 16px host`, async ({ page }) => {
    await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false' });
    const baseline = await settledGeometry(page);
    expect(baseline.rootFontSize).toBe('16px');

    await page.route(/\/fixture\.html(\?|$)/, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace('</head>', `<style>${hostPage.css}</style></head>`);
      await route.fulfill({ response, body });
    });
    await page.reload();
    const shifted = await settledGeometry(page);
    expect(shifted.rootFontSize).toBe(hostPage.root);
    expect(shifted.boxes).toEqual(baseline.boxes);
  });
}
