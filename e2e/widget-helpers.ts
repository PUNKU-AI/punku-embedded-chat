import { expect, Page } from '@playwright/test';

declare global {
  interface Window {
    __widgetRoots: WeakMap<Element, ShadowRoot>;
    __hostDiagnostics: { cancellations: number; replays: number; opens: number; settled: number; target?: string };
  }
}

export async function loadWidget(page: Page, props: Record<string, string> = {}) {
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
  await page.goto('/fixture.html?' + new URLSearchParams(props));
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat, punku-control');
    return !!host && !!window.__widgetRoots.get(host)?.querySelector('.cl-trigger, a');
  })).toBe(true);
  expect(await page.evaluate(() => document.querySelector('punku-chat, punku-control')?.shadowRoot)).toBeNull();
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
