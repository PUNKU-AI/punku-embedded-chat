import { test, expect, Page } from '@playwright/test';
import { loadWidget } from './widget-helpers';

// Host pages can change the root font-size. Elementor kits often set
// html, body { font-size: 10px }, and many themes use html { font-size: 62.5% }.
// rem inside the widget's closed shadow root still follows that root. The widget
// floors every length at its designed px size: a small root keeps the designed
// geometry, and a larger root keeps the larger widget that it had before.
const hosts = [
  { name: 'Elementor kit 10px', css: 'html, body { font-size: 10px; }', root: 10 },
  { name: '62.5% root', css: 'html { font-size: 62.5%; }', root: 10 },
  { name: '20px root', css: 'html { font-size: 20px; }', root: 20 },
];

const measured = [
  '.cl-trigger', '.cl-trigger-icon.cl-scale-100', '.cl-chat-window', '.cl-window', '.cl-header',
  '.cl-messages_container', '.cl-bot_message', '.cl-input-element',
];

type Box = { width: number; height: number; padding: string; radius: string; fontSize: string };
type Geometry = { rootFontSize: string; boxes: Record<string, Box | null> };

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const pageErrors: string[] = [];
  errors.set(page, pageErrors);
  page.on('pageerror', (error) => pageErrors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function geometry(page: Page): Promise<Geometry | null> {
  return page.evaluate((selectors) => {
    const host = document.querySelector('punku-chat');
    const root = host && window.__widgetRoots.get(host);
    if (!root?.querySelector('.cl-trigger')) return null;
    const boxes: Record<string, Box | null> = {};
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

async function settledGeometry(page: Page): Promise<Geometry> {
  // The window opens with a transition. Wait until two reads agree.
  let previous = '';
  let current = '';
  await expect.poll(async () => {
    previous = current;
    current = JSON.stringify(await geometry(page));
    return current !== 'null' && current === previous;
  }).toBe(true);
  return JSON.parse(current) as Geometry;
}

async function injectHostCss(page: Page, css: string) {
  await page.route(/\/fixture\.html(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('</head>', `<style>${css}</style></head>`);
    await route.fulfill({ response, body });
  });
}

const lengths = (value: string) => (value.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

// Boxes whose size the stylesheet sets. The message list fills the rest of the
// fixed-height window, and a bubble sizes itself to its text, so their boxes can
// shrink when the paddings around them grow. Their paddings and radii still count.
const designedBoxes = new Set([
  '.cl-trigger', '.cl-trigger-icon.cl-scale-100', '.cl-chat-window', '.cl-window', '.cl-input-element',
]);

// No designed box, padding or radius may get smaller than on a 16px host.
function expectNeverSmaller(shifted: Geometry, baseline: Geometry) {
  for (const selector of measured) {
    const now = shifted.boxes[selector];
    const before = baseline.boxes[selector];
    expect(now === null, selector).toBe(before === null);
    if (!now || !before) continue;
    if (designedBoxes.has(selector)) {
      expect(now.width, `${selector} width`).toBeGreaterThanOrEqual(before.width);
      expect(now.height, `${selector} height`).toBeGreaterThanOrEqual(before.height);
    }
    for (const key of ['padding', 'radius'] as const) {
      const after = lengths(now[key]);
      const designed = lengths(before[key]);
      expect(after.length, `${selector} ${key}`).toBe(designed.length);
      after.forEach((value, index) => {
        expect(value, `${selector} ${key}`).toBeGreaterThanOrEqual(designed[index]);
      });
    }
  }
}

for (const hostPage of hosts) {
  const trigger = Math.max(48, 3 * hostPage.root);

  test(`${hostPage.name}: trigger is never smaller than 48px`, async ({ page }) => {
    await injectHostCss(page, hostPage.css);
    await loadWidget(page, { show_closed_widget_hint: 'false' });
    const closed = await settledGeometry(page);
    expect(closed.rootFontSize).toBe(`${hostPage.root}px`);
    expect(closed.boxes['.cl-trigger']).toMatchObject({ width: trigger, height: trigger });
    expect(closed.boxes['.cl-trigger-icon.cl-scale-100']).toMatchObject({ width: trigger / 2, height: trigger / 2 });
  });

  test(`${hostPage.name}: open window is never smaller than on a 16px host`, async ({ page }) => {
    await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false' });
    const baseline = await settledGeometry(page);
    expect(baseline.rootFontSize).toBe('16px');

    await injectHostCss(page, hostPage.css);
    await page.reload();
    const shifted = await settledGeometry(page);
    expect(shifted.rootFontSize).toBe(`${hostPage.root}px`);
    if (hostPage.root <= 16) {
      // A smaller root gets exactly the designed geometry.
      expect(shifted.boxes).toEqual(baseline.boxes);
      return;
    }
    // A larger root keeps the larger widget it had before the px floor.
    expectNeverSmaller(shifted, baseline);
    const scale = hostPage.root / 16;
    expect(shifted.boxes['.cl-messages_container']?.padding).toBe(`${8 * scale}px ${14 * scale}px`);
    expect(shifted.boxes['.cl-input-element']?.padding).toBe(`${20 * scale}px`);
    expect(shifted.boxes['.cl-window']?.radius).toBe(`${16 * scale}px`);
  });
}
