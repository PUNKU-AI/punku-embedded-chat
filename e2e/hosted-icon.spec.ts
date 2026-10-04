import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { loadWidget } from './widget-helpers';

const replacement = readFileSync(resolve(__dirname, '../assets/lucide-overrides/message-square-text.svg'), 'utf8');

function luminance(color: string) {
  const channels = color.match(/\d+/g)!.slice(0, 3).map(value => {
    const channel = Number(value) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

for (const buttonText of ['#ffffff', '']) {
test(`hosted icon stays readable with ${buttonText || 'default'} button text on a white header`, async ({ page }, testInfo) => {
  let iconRequests = 0;
  await page.route('https://cdn.punku.ai/chat/icons/lucide/messagesquaretext.svg', route => {
    iconRequests += 1;
    return route.fulfill({ contentType: 'image/svg+xml', body: replacement });
  });
  await loadWidget(page, {
    start_open: 'true', theme: 'default', header_icon_name: 'MessageSquareText',
    button_text_color: buttonText, background_color: '#f1efee',
    chat_trigger_style: '{"backgroundColor":"#3aaa35","color":"#ffffff"}',
    send_button_style: '{"backgroundColor":"#3aaa35"}',
  });
  await expect.poll(() => page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    return root.querySelectorAll('.cl-header-logo polygon, .cl-header-logo line').length;
  })).toBe(4);
  const colors = await page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    return {
      header: getComputedStyle(root.querySelector('.cl-header')!).backgroundColor,
      bubble: getComputedStyle(root.querySelector('.cl-header-logo polygon')!).fill,
      text: Array.from(root.querySelectorAll('.cl-header-logo line')).map(line => getComputedStyle(line).stroke),
    };
  });
  expect(iconRequests).toBe(1);
  expect(colors.header).toBe('rgb(255, 255, 255)');
  expect(colors.text).toEqual(Array(3).fill(buttonText ? 'rgb(255, 255, 255)' : 'rgb(15, 23, 42)'));
  expect(contrast(colors.header, colors.bubble)).toBeGreaterThan(3);
  for (const color of colors.text) expect(contrast(color, colors.bubble)).toBeGreaterThan(3);
  const screenshot = testInfo.outputPath('hosted-icon.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('hosted-icon', { path: screenshot, contentType: 'image/png' });
});
}
