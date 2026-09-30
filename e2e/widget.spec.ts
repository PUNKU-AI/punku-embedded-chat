import { test, expect, Page } from '@playwright/test';
import { activate, assertDestination, assertHintVisible, elementState, loadWidget } from './widget-helpers';

const link = '.markdown-body a strong';
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
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
    await page.screenshot({ path: testInfo.outputPath(`hint-${position}.png`) });
  });
}

test('hint stays visible at the opposite corner and after resize', async ({ page }) => {
  await loadWidget(page, { chat_position: 'top-left', closed_widget_hint_text: 'A long museum hint. '.repeat(12) });
  await assertHintVisible(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await assertHintVisible(page);
});

test('long side hints remain inside the bottom corner', async ({ page }) => {
  await loadWidget(page, { closed_widget_hint_text: 'Ask me about museum exhibits and tickets. '.repeat(8) });
  await assertHintVisible(page);
});

test('oversized hints keep all text reachable by scrolling', async ({ page }) => {
  await loadWidget(page, { closed_widget_hint_text: 'Ask about museum tickets and exhibits. '.repeat(100) });
  await assertHintVisible(page);
  const text = await page.evaluateHandle(() => {
    const host = document.querySelector('punku-chat')!;
    return window.__widgetRoots.get(host)!.querySelector<HTMLElement>('.cl-closed-widget-hint-text')!;
  });
  expect(await text.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await text.asElement()!.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => text.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await assertHintVisible(page);
  await text.dispose();
});

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

test('disabled hints stay absent', async ({ page }) => {
  await loadWidget(page, { show_closed_widget_hint: 'false' });
  expect(await elementState(page, '.cl-closed-widget-hint')).toBeNull();
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
  // Focus is setup only. The keyboard generates a trusted activation event.
  await page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    window.__widgetRoots.get(host)!.querySelector<HTMLAnchorElement>('.markdown-body a')!.focus();
  });
  const popupPromise = context.waitForEvent('page');
  await page.keyboard.press(key);
  await assertDestination(await popupPromise);
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
});
