import { test, expect, Page, TestInfo } from '@playwright/test';
import { activate, assertDestination, assertHintVisible, elementState, loadWidget } from './widget-helpers';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const link = '.markdown-body a strong';
const pageErrors = new WeakMap<Page, string[]>();
async function saveVisualScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const screenshot = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshot });
  await testInfo.attach(`gemini-${name}`, { path: screenshot, contentType: 'image/png' });
}
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

test('fixture serves the exact release bundle', async ({ request }) => {
  const filename = path.resolve(__dirname, '../dist/build/static/js/bundle.min.js');
  const response = await request.get('/bundle.js');
  expect(response.ok()).toBe(true);
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  expect(digest(await response.body())).toBe(digest(readFileSync(filename)));
});

for (const position of ['left', 'top', 'bottom']) {
  test(`hint ${position}: visible text, colors, and viewport bounds`, async ({ page }, testInfo) => {
    const text = 'Hallo!\nAsk about tickets, opening hours, and all museum exhibits.';
    await loadWidget(page, {
      nitro: 'true',
      closed_widget_hint_text: text, closed_widget_hint_position: position,
      closed_widget_hint_background_color: '#123456', closed_widget_hint_text_color: '#ffffff',
    });
    const hint = await assertHintVisible(page);
    expect(hint.text).toBe(text);
    expect(hint.background).toBe('rgb(18, 52, 86)');
    expect(hint.color).toBe('rgb(255, 255, 255)');
    await page.bringToFront();
    await saveVisualScreenshot(page, testInfo, `hint-${position}`);
  });
}

test('hint stays visible at the opposite corner and after resize', async ({ page }, testInfo) => {
  await loadWidget(page, { chat_position: 'top-left', closed_widget_hint_text: 'A long museum hint. '.repeat(12) });
  await assertHintVisible(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.bringToFront();
  // Playwright's screenshot path synchronizes WebKit's virtual display after
  // metric overrides. Check the rendered viewport without changing bounds.
  await page.screenshot();
  await assertHintVisible(page);
  await saveVisualScreenshot(page, testInfo, 'hint-resized');
  await assertHintVisible(page);
});

test('long side hints remain inside the bottom corner', async ({ page }) => {
  await loadWidget(page, { closed_widget_hint_text: 'Ask me about museum exhibits and tickets. '.repeat(8) });
  await assertHintVisible(page);
});

for (const position of ['left', 'top', 'bottom']) {
  test(`oversized ${position} hint shows two lines and keeps the trigger clickable`, async ({ page, hasTouch }) => {
    const content = 'Hello!\n' + 'Ask about museum tickets and exhibits. '.repeat(100);
    await loadWidget(page, {
      closed_widget_hint_text: content,
      closed_widget_hint_position: position,
    });
    await assertHintVisible(page);
    const geometry = await page.evaluate(() => {
      const host = document.querySelector('punku-chat')!;
      const root = window.__widgetRoots.get(host)!;
      const text = root.querySelector<HTMLElement>('.cl-closed-widget-hint-text')!;
      const trigger = root.querySelector<HTMLElement>('.cl-trigger')!;
      const triggerRect = trigger.getBoundingClientRect();
      const hit = root.elementFromPoint(
        triggerRect.x + triggerRect.width / 2,
        triggerRect.y + triggerRect.height / 2,
      );
      return {
        text: text.textContent,
        textHeight: text.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(text).lineHeight),
        triggerReceivesInput: hit === trigger || trigger.contains(hit),
      };
    });
    expect(geometry.text).toBe(content);
    expect(geometry.lineHeight).toBeGreaterThan(0);
    expect(geometry.textHeight).toBeGreaterThanOrEqual(2 * geometry.lineHeight - 1);
    expect(geometry.textHeight).toBeLessThanOrEqual(2 * geometry.lineHeight + 1);
    expect(geometry.triggerReceivesInput).toBe(true);
    await activate(page, '.cl-trigger', hasTouch);
    await expect.poll(() => elementState(page, '.cl-closed-widget-hint')).toBeNull();
    await expect.poll(async () => (await elementState(page, '.cl-chat-window'))?.visibility).toBe('visible');
  });
}

test('hint hides on opening and returns after closing when repeat is enabled', async ({ page, hasTouch }) => {
  await loadWidget(page);
  await assertHintVisible(page);
  await activate(page, '.cl-trigger', hasTouch);
  await expect.poll(() => elementState(page, '.cl-closed-widget-hint')).toBeNull();
  await activate(page, '.cl-trigger', hasTouch);
  await assertHintVisible(page);
});

test('hint timeout and session persistence', async ({ page, hasTouch }) => {
  await loadWidget(page, { closed_widget_hint_auto_hide_ms: '1200', closed_widget_hint_show_once: 'true' });
  await assertHintVisible(page);
  await expect.poll(async () => (await elementState(page, '.cl-closed-widget-hint'))?.opacity).toBe(0);
  await activate(page, '.cl-trigger', hasTouch);
  await activate(page, '.cl-trigger', hasTouch);
  await expect.poll(async () => (await elementState(page, '.cl-closed-widget-hint'))?.opacity).toBe(0);
  await page.reload();
  await expect.poll(async () => (await elementState(page, '.cl-closed-widget-hint'))?.opacity).toBe(0);
});

test('disabled hints stay absent', async ({ page }, testInfo) => {
  await loadWidget(page, { show_closed_widget_hint: 'false' });
  expect(await elementState(page, '.cl-closed-widget-hint')).toBeNull();
  await page.bringToFront();
  await saveVisualScreenshot(page, testInfo, 'hint-disabled');
});

test('branding link opens its exact referral URL', async ({ page, context, hasTouch }) => {
  await loadWidget(page, { start_open: 'true', nitro: 'true' });
  const url = 'https://www.punku.ai/?utm_source=customer_widget&utm_medium=referral&utm_campaign=powered_by';
  // Serve a synthetic destination without contacting the public website.
  await context.route(url, (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Branding destination</h1>' }));
  const popupPromise = context.waitForEvent('page');
  await activate(page, 'a[href^="https://www.punku.ai/"]', hasTouch);
  const popup = await popupPromise;
  await expect(popup).toHaveURL(url);
  await expect(popup.getByRole('heading')).toHaveText('Branding destination');
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  expect(await popup.evaluate(() => document.referrer)).toBe('');
  await expect.poll(() => page.evaluate(() => window.__hostDiagnostics.settled)).toBe(1);
  expect(context.pages()).toHaveLength(2);
});

for (const nitro of ['false', 'true']) {
  test(`nested link opens exactly once with Nitro interception ${nitro}`, async ({ page, context, hasTouch }, testInfo) => {
    await loadWidget(page, { start_open: 'true', nitro });
    const popupPromise = context.waitForEvent('page');
    await activate(page, link, hasTouch);
    const popup = await popupPromise;
    await assertDestination(popup);
    // The fixture's queued host replay has finished before this assertion.
    await expect.poll(() => page.evaluate(() => window.__hostDiagnostics.cancellations)).toBe(nitro === 'true' ? 1 : 0);
    await expect.poll(() => page.evaluate(() => window.__hostDiagnostics.settled)).toBe(nitro === 'true' ? 1 : 0);
    expect(context.pages()).toHaveLength(2);
    expect(await page.evaluate(() => window.__hostDiagnostics.opens)).toBe(nitro === 'true' ? 1 : 0);
    expect(await page.evaluate(() => window.__hostDiagnostics.replays)).toBe(0);
    await page.bringToFront();
    await page.screenshot({ path: testInfo.outputPath(`chat-nitro-${nitro}.png`) });
  });
}

test('Nitro host replay cannot activate an unprotected closed-root link', async ({ page, context, hasTouch }) => {
  await loadWidget(page, { control: 'true', nitro: 'true' });
  await activate(page, 'a strong', hasTouch);
  await expect.poll(() => page.evaluate(() => window.__hostDiagnostics.replays)).toBe(1);
  expect(await page.evaluate(() => window.__hostDiagnostics.target)).toBe('PUNKU-CONTROL');
  expect(context.pages()).toHaveLength(1);
});

for (const key of ['Enter', 'ControlOrMeta+Enter']) {
test(`${key} opens the Nitro-intercepted link`, async ({ page, context, hasTouch }) => {
  test.skip(hasTouch, 'Desktop keyboard input is covered on all three desktop engines.');
  await loadWidget(page, { start_open: 'true', nitro: 'true' });
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
  // The chat schedules initial input focus. Wait for it before taking focus.
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    return window.__widgetRoots.get(host)!.activeElement?.classList.contains('cl-input-element');
  })).toBe(true);
  // Focus is setup only. The keyboard generates a trusted activation event.
  await page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    window.__widgetRoots.get(host)!.querySelector<HTMLAnchorElement>('.markdown-body a')!.focus();
  });
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    return root.activeElement === root.querySelector('.markdown-body a');
  })).toBe(true);
  const popupPromise = context.waitForEvent('page');
  await page.keyboard.press(key);
  await assertDestination(await popupPromise);
  await expect.poll(() => page.evaluate(() => window.__hostDiagnostics.settled)).toBe(1);
  expect(await page.evaluate(() => window.__hostDiagnostics.cancellations)).toBe(1);
  expect(await page.evaluate(() => window.__hostDiagnostics.replays)).toBe(0);
  expect(context.pages()).toHaveLength(2);
});
}

test('middle-click retains native navigation under Nitro interception', async ({ page, context, hasTouch }) => {
  test.skip(hasTouch, 'Phones use touch activation.');
  await loadWidget(page, { start_open: 'true', nitro: 'true' });
  const popupPromise = context.waitForEvent('page');
  await activate(page, link, false, 'middle');
  await assertDestination(await popupPromise);
  expect(await page.evaluate(() => window.__hostDiagnostics.opens)).toBe(0);
  expect(await page.evaluate(() => window.__hostDiagnostics.cancellations)).toBe(0);
  expect(context.pages()).toHaveLength(2);
});
