import { test, expect, Page } from '@playwright/test';
import { loadWidget } from './widget-helpers';

const outlinedIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 8h8"/><path d="M8 12h6"/></svg>';

async function headerColors(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const header = root.querySelector<HTMLElement>('.cl-header')!;
    const logo = root.querySelector<SVGElement>('.cl-default-header-icon svg')!;
    const controls = Array.from(root.querySelectorAll<SVGElement>('.cl-new-session-btn svg, .cl-close-btn svg'));
    return {
      color: getComputedStyle(header).color,
      background: getComputedStyle(header).backgroundColor,
      stroke: getComputedStyle(logo).stroke,
      fills: Array.from(logo.querySelectorAll('path')).map((path) => getComputedStyle(path).fill),
      controls: controls.map((icon) => getComputedStyle(icon).stroke),
    };
  });
}

test('header icons stay visible with white button text and a default header', async ({ page }, testInfo) => {
  await page.route('https://cdn.punku.ai/chat/icons/lucide/messagesquaretext.svg', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: outlinedIcon }));
  await loadWidget(page, {
    start_open: 'true', theme: 'default', header_icon_name: 'MessageSquareText',
    button_text_color: '#ffffff', background_color: '#f1efee',
    bot_message_color: '#3aaa35', user_message_color: '#046035',
    show_close_button_on_desktop: 'true',
  });
  await expect.poll(async () => (await headerColors(page)).fills.length).toBe(3);
  const colors = await headerColors(page);
  expect(colors.background).toBe('rgb(255, 255, 255)');
  expect(colors.color).toBe('rgb(15, 23, 42)');
  expect(colors.stroke).toBe(colors.color);
  expect(colors.fills).toEqual(['none', 'none', 'none']);
  expect(colors.controls).toEqual([colors.color, colors.color]);
  const screenshot = testInfo.outputPath('default-header-icons.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('default-header-icons', { path: screenshot, contentType: 'image/png' });
});

for (const theme of ['default', 'dark', 'ocean', 'aurora', 'punku-ai-bookingkit', 'swarovski']) {
  test(`${theme} header icons follow the theme text color`, async ({ page }) => {
    await loadWidget(page, {
      start_open: 'true', theme, header_icon_name: 'MessageSquare',
      show_close_button_on_desktop: 'true',
    });
    const colors = await headerColors(page);
    expect(colors.stroke).toBe(colors.color);
    expect(colors.stroke).not.toBe(colors.background);
    expect(colors.fills.length).toBeGreaterThan(0);
    expect(colors.fills.every((fill) => fill === 'none')).toBe(true);
    expect(colors.controls).toEqual([colors.color, colors.color]);
  });
}

for (const [background, foreground] of [['#3aaa35', '#ffffff'], ['#ffffff', '#046035']]) {
  test(`custom ${background} header keeps its ${foreground} icon color`, async ({ page }) => {
    await loadWidget(page, {
      start_open: 'true', header_icon_name: 'Bot',
      button_color: background, button_text_color: foreground,
      show_close_button_on_desktop: 'true',
    });
    const colors = await headerColors(page);
    expect(colors.stroke).toBe(colors.color);
    expect(colors.stroke).not.toBe(colors.background);
    expect(colors.color).toBe(foreground === '#ffffff' ? 'rgb(255, 255, 255)' : 'rgb(4, 96, 53)');
    expect(colors.fills.every((fill) => fill === 'none')).toBe(true);
    expect(colors.controls).toEqual([colors.color, colors.color]);
  });
}

test('a custom header image keeps its source and renders', async ({ page }) => {
  const source = 'http://127.0.0.1:4179/custom-header.svg';
  await page.route(source, (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" fill="#046035"/></svg>',
  }));
  await loadWidget(page, { start_open: 'true', theme: 'default', header_icon: source });
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const image = root.querySelector<HTMLImageElement>('.cl-header-logo')!;
    return { source: image.src, width: image.naturalWidth, height: image.naturalHeight };
  })).toEqual({ source, width: 36, height: 36 });
});
