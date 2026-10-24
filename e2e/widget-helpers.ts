import { expect, Page } from '@playwright/test';

declare global {
  interface Window {
    __widgetRoots: WeakMap<Element, ShadowRoot>;
    __hostDiagnostics: { cancellations: number; replays: number; opens: number; settled: number; target?: string };
    __setKeyboard: (height: number) => void;
  }
}

export async function loadWidget(page: Page, props: Record<string, string> = {}, fixturePath = '/fixture.html') {
  // Record returned roots without changing their mode. Opening the shadow root
  // would hide the production regression. No synthetic clicks activate links.
  await page.addInitScript(() => {
    window.__widgetRoots = new WeakMap();
    const attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      const root = attachShadow.call(this, options);
      window.__widgetRoots.set(this, root);
      return root;
    };
  });
  // Keep tests local. Fonts and error-report requests cannot reach customers.
  await page.context().route(/https?:\/\//, (route) => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    return route.abort();
  });
  await page.bringToFront();
  await page.goto(fixturePath + '?' + new URLSearchParams(props));
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat, punku-control');
    return !!host && !!window.__widgetRoots.get(host)?.querySelector('.cl-trigger, a');
  })).toBe(true);
  expect(await page.evaluate(() => document.querySelector('punku-chat, punku-control')?.shadowRoot)).toBeNull();
}

export async function extendHostPage(page: Page, html: string) {
  // Add host elements before the fixture content.
  await page.route(/\/fixture\.html(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('<main>', `${html}<main>`);
    await route.fulfill({ response, body });
  });
}

export async function scaleHostPage(page: Page, width = 320) {
  // Wix sites fix the layout width with <meta name="viewport" content="width=320">.
  // The browser scales the page up to the screen width: 2.3 on a 740 px screen.
  await page.route(/\/fixture\.html(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('content="width=device-width,initial-scale=1"', `content="width=${width}"`);
    await route.fulfill({ response, body });
  });
}

export async function widenHostPage(page: Page, html = '') {
  // A host element 43 px wider than the viewport, as on the live page in #69:
  // 433 px on a 390 px phone. `html` adds more host elements after it.
  const banner = '<div style="width:calc(100vw + 43px);height:40px;background:#c8d3df"></div>';
  await extendHostPage(page, `${banner}${html}`);
}

// Host marker in the bottom-right corner of the layout viewport. Pass it to
// widenHostPage. panToLayoutCorner scrolls it into view to pan the visible
// area, as a visitor can.
export const hostCorner = '<div id="host-corner" style="position:fixed;right:0;bottom:0;width:1px;height:1px"></div>';

export async function screenView(page: Page) {
  return page.evaluate(() => {
    const viewport = window.visualViewport!;
    // A fixed box with inset 0 shows the layout viewport. A plain fixed box
    // follows it, not the screen.
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none';
    document.body.append(probe);
    const layout = probe.getBoundingClientRect();
    probe.remove();
    return {
      documentWidth: document.documentElement.scrollWidth,
      layout: { width: layout.width, height: layout.height },
      screen: { left: viewport.offsetLeft, top: viewport.offsetTop, width: viewport.width, height: viewport.height },
    };
  });
}

export async function partsOutsideScreen(page: Page, selectors: string[]) {
  // Client coordinates and the visual viewport offsets both start at the
  // layout viewport. Allow half a pixel for rounding.
  return page.evaluate((selectors) => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const viewport = window.visualViewport!;
    const left = viewport.offsetLeft;
    const top = viewport.offsetTop;
    const right = left + viewport.width;
    const bottom = top + viewport.height;
    const round = (value: number) => Math.round(value);
    return selectors.flatMap((selector) => {
      const element = root.querySelector<HTMLElement>(selector);
      const box = element?.getBoundingClientRect();
      if (!element || !box || box.width === 0 || box.height === 0) return [`${selector} is not shown`];
      if (box.left >= left - 0.5 && box.top >= top - 0.5 && box.right <= right + 0.5 && box.bottom <= bottom + 0.5) return [];
      return [`${selector} x ${round(box.left)}-${round(box.right)}, y ${round(box.top)}-${round(box.bottom)}; ` +
        `screen x ${round(left)}-${round(right)}, y ${round(top)}-${round(bottom)}`];
    });
  }, selectors);
}

export async function edgeGaps(page: Page, selector: string) {
  // Distances in CSS px from the box to the edges of the visible area
  // (`screen`) and of the layout viewport (`layout`).
  return page.evaluate((selector) => {
    const host = document.querySelector('punku-chat')!;
    const box = window.__widgetRoots.get(host)!.querySelector(selector)!.getBoundingClientRect();
    const viewport = window.visualViewport!;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none';
    document.body.append(probe);
    const layout = probe.getBoundingClientRect();
    probe.remove();
    const round = (value: number) => Math.round(value);
    return {
      screen: {
        left: round(box.left - viewport.offsetLeft),
        top: round(box.top - viewport.offsetTop),
        right: round(viewport.offsetLeft + viewport.width - box.right),
        bottom: round(viewport.offsetTop + viewport.height - box.bottom),
      },
      layout: {
        left: round(box.left - layout.left),
        top: round(box.top - layout.top),
        right: round(layout.right - box.right),
        bottom: round(layout.bottom - box.bottom),
      },
    };
  }, selector);
}

export async function panToLayoutCorner(page: Page) {
  await page.evaluate(() => document.getElementById('host-corner')!.scrollIntoView({ block: 'end', inline: 'end' }));
  const view = await screenView(page);
  // Chromium phones make the layout viewport larger than the screen, so the
  // visible area moves inside it. Elsewhere the two are the same size.
  if (view.layout.width > view.screen.width + 1) {
    await expect.poll(async () => (await screenView(page)).screen.left).toBeGreaterThan(0);
  }
  return screenView(page);
}

export async function fakeKeyboard(page: Page, height: number) {
  // Playwright cannot open an on-screen keyboard. On iOS Safari and in Chrome
  // on Android 108+, the keyboard makes only the visual viewport shorter.
  // Install a visual viewport that is `height` px shorter than the real one.
  // setKeyboard opens and closes the keyboard later.
  await page.addInitScript((height) => {
    const real = window.visualViewport!;
    const fake = new EventTarget();
    let keyboard = height;
    for (const key of ['offsetLeft', 'offsetTop', 'width', 'scale', 'pageLeft', 'pageTop'] as const) {
      Object.defineProperty(fake, key, { get: () => real[key] });
    }
    Object.defineProperty(fake, 'height', { get: () => real.height - keyboard });
    for (const type of ['resize', 'scroll']) real.addEventListener(type, () => fake.dispatchEvent(new Event(type)));
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
    // The browser fires only a visual viewport resize for the keyboard.
    window.__setKeyboard = (value: number) => {
      keyboard = value;
      fake.dispatchEvent(new Event('resize'));
    };
  }, height);
}

export async function setKeyboard(page: Page, height: number) {
  // Needs fakeKeyboard. 0 closes the keyboard.
  await page.evaluate((height) => window.__setKeyboard(height), height);
}

export async function waitForSettledBoxes(page: Page, selectors: string[]) {
  // The window scales in when it opens. Wait until each box is shown at full
  // scale and stays the same in two reads, so a check cannot pass mid-move.
  // On a scaled host page (scaleHostPage), the widget root scales the whole
  // widget down by the page scale. Full scale is then the root scale.
  let previous = '';
  await expect.poll(async () => {
    const current = await page.evaluate((selectors) => {
      const host = document.querySelector('punku-chat')!;
      const root = window.__widgetRoots.get(host)!;
      if (root.querySelector('.cl-chat-window')?.getAnimations().length) return 'moving';
      const widgetRoot = root.querySelector<HTMLElement>('.cl-widget-root');
      const rootWidth = widgetRoot?.getBoundingClientRect().width ?? 0;
      const scale = widgetRoot && rootWidth > 0 && widgetRoot.offsetWidth > 0 ? rootWidth / widgetRoot.offsetWidth : 1;
      return selectors.map((selector) => {
        const element = root.querySelector<HTMLElement>(selector);
        if (!element) return 'missing';
        const box = element.getBoundingClientRect();
        if (Math.abs(box.width - element.offsetWidth * scale) > 1 || Math.abs(box.height - element.offsetHeight * scale) > 1) return 'scaled';
        return [box.left, box.top, box.right, box.bottom].map(Math.round).join(',');
      }).join('|');
    }, selectors);
    const settled = current === previous && !/missing|scaled|moving/.test(current);
    previous = current;
    return settled;
  }, { intervals: [100] }).toBe(true);
}

export async function waitForInputFocus(page: Page) {
  // The open window focuses its input 100 ms after opening or a new message.
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    return window.__widgetRoots.get(host)?.activeElement?.classList.contains('cl-input-element');
  })).toBe(true);
}

export async function elementState(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const host = document.querySelector('punku-chat, punku-control');
    const element = host && window.__widgetRoots.get(host)?.querySelector<HTMLElement>(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      right: rect.right, bottom: rect.bottom, text: element.textContent,
      opacity: Number(style.opacity), display: style.display, visibility: style.visibility,
      color: style.color, background: style.backgroundColor,
    };
  }, selector);
}

export async function assertHintVisible(page: Page) {
  await expect.poll(async () => (await elementState(page, '.cl-closed-widget-hint'))?.opacity).toBe(1);
  const viewport = page.viewportSize()!;
  // Resize updates the visual viewport and ResizeObserver on separate frames.
  // Wait for actual fitted geometry, rather than reading the previous frame.
  await expect.poll(async () => {
    const hint = await elementState(page, '.cl-closed-widget-hint');
    return !!hint && hint.width > 0 && hint.height > 0 && hint.x >= 0 && hint.y >= 0 &&
      hint.right <= viewport.width && hint.bottom <= viewport.height;
  }, { message: 'The visible hint must fit inside the viewport.' }).toBe(true);
  const hint = (await elementState(page, '.cl-closed-widget-hint'))!;
  expect(hint.display).not.toBe('none');
  expect(hint.visibility).toBe('visible');
  expect(hint.width).toBeGreaterThan(0);
  expect(hint.height).toBeGreaterThan(0);
  expect(hint.x).toBeGreaterThanOrEqual(0);
  expect(hint.y).toBeGreaterThanOrEqual(0);
  expect(hint.right).toBeLessThanOrEqual(viewport.width);
  expect(hint.bottom).toBeLessThanOrEqual(viewport.height);
  return hint;
}

export async function activate(page: Page, selector: string, hasTouch: boolean, button: 'left' | 'middle' = 'left') {
  const handle = await page.evaluateHandle((selector) => {
    const host = document.querySelector('punku-chat, punku-control')!;
    return window.__widgetRoots.get(host)?.querySelector(selector);
  }, selector);
  const element = handle.asElement();
  expect(element).not.toBeNull();
  try {
    // Native input with actionability checks. Inline links can span lines;
    // their bounding-box center can be whitespace, so use the element's quads.
    if (hasTouch) await element!.tap();
    else await element!.click({ button });
  } finally {
    await handle.dispose();
  }
}

export async function assertDestination(page: Page) {
  await expect(page).toHaveURL('http://127.0.0.1:4179/destination.html?source=chat&count=2#details');
  await expect(page.getByRole('heading')).toHaveText('Information link opened');
  expect(await page.evaluate(() => window.opener === null)).toBe(true);
  expect(await page.evaluate(() => document.referrer)).toBe('');
}
