import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Old embeds load dist/build/static/js/bundle.min.js from jsDelivr. That file
// is a forwarder: it loads the v1 release from cdn.punku.ai, and the full
// widget (widget.min.js) from jsDelivr when that load fails.
const pageOrigin = 'https://customer.example.com';
const jsdelivr = 'https://cdn.jsdelivr.net/gh/PUNKU-AI/punku-embedded-chat';
const forwarderUrls = [`${jsdelivr}/dist/build/static/js/bundle.min.js`, `${jsdelivr}@v1/dist/build/static/js/bundle.min.js`];
const cdnUrl = 'https://cdn.punku.ai/chat/v1/bundle.min.js';
const fallbackUrl = `${jsdelivr}@v1/dist/build/static/js/widget.min.js`;
const forwarder = readFileSync(path.resolve(__dirname, '../dist/build/static/js/bundle.min.js'));
const widget = readFileSync(path.resolve(__dirname, '../dist/build/static/js/widget.min.js'));

type Options = { forwarderUrl?: string; cdnFails?: boolean; fallbackFails?: boolean; widgetFirst?: boolean };

// Every response comes from this test. Other requests, such as header icons
// and the backend, are blocked.
async function openPage(page: Page, options: Options = {}) {
  const forwarderUrl = options.forwarderUrl ?? forwarderUrls[0];
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__widgetRoots = new WeakMap();
    const attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (settings) {
      const root = attachShadow.call(this, settings);
      window.__widgetRoots.set(this, root);
      return root;
    };
  });
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
    ${options.widgetFirst ? `<script src="${pageOrigin}/widget.js"></script>` : ''}
    <script src="${forwarderUrl}"></script>
    <punku-chat host_url="https://api.example.com" flow_id="00000000-0000-4000-8000-000000000003"
      show_closed_widget_hint="false" enable_client_error_reporting="false"></punku-chat></body></html>`;
  // Both CDNs send this type. The widget has UTF-8 text, so the charset matters.
  const script = (body: Buffer) => ({ contentType: 'application/javascript; charset=utf-8', headers: { 'Cache-Control': 'no-store' }, body });
  await page.context().route(/https?:\/\//, async (route) => {
    const url = route.request().url();
    if (url === `${pageOrigin}/`) return route.fulfill({ contentType: 'text/html', body: html });
    if (url === `${pageOrigin}/widget.js`) return route.fulfill(script(widget));
    if (url === forwarderUrl || url === cdnUrl || url === fallbackUrl) requests.push(url);
    if (url === forwarderUrl) return route.fulfill(script(forwarder));
    if (url === cdnUrl) return options.cdnFails ? route.abort('connectionrefused') : route.fulfill(script(widget));
    if (url === fallbackUrl) return options.fallbackFails ? route.abort('connectionrefused') : route.fulfill(script(widget));
    return route.abort('blockedbyclient');
  });
  await page.bringToFront();
  await page.goto(`${pageOrigin}/`);
  return { requests, errors };
}

async function widgetRendered(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat');
    return !!customElements.get('punku-chat') && !!host && !!window.__widgetRoots.get(host)?.querySelector('.cl-trigger, a');
  });
}

for (const forwarderUrl of forwarderUrls) {
  test(`${forwarderUrl.includes('@v1') ? '@v1' : 'unversioned'} forwarder loads the v1 release from cdn.punku.ai once`, async ({ page }) => {
    const { requests, errors } = await openPage(page, { forwarderUrl });
    await expect.poll(() => widgetRendered(page)).toBe(true);
    expect(requests).toEqual([forwarderUrl, cdnUrl]);
    expect(errors).toEqual([]);
  });
}

test('forwarder loads the full widget from jsDelivr when cdn.punku.ai fails', async ({ page }) => {
  const { requests, errors } = await openPage(page, { cdnFails: true });
  await expect.poll(() => widgetRendered(page)).toBe(true);
  expect(requests).toEqual([forwarderUrls[0], cdnUrl, fallbackUrl]);
  expect(errors).toEqual([]);
});

test('forwarder stops after the fallback fails, without a loop', async ({ page }) => {
  const { requests, errors } = await openPage(page, { cdnFails: true, fallbackFails: true });
  await expect.poll(() => requests.length).toBe(3);
  // Give a loop time to show itself.
  await page.waitForTimeout(500);
  expect(requests).toEqual([forwarderUrls[0], cdnUrl, fallbackUrl]);
  expect(await page.evaluate(() => !!customElements.get('punku-chat'))).toBe(false);
  expect(errors).toEqual([]);
});

test('forwarder loads nothing when the widget is already defined', async ({ page }) => {
  const { requests, errors } = await openPage(page, { widgetFirst: true });
  await expect.poll(() => widgetRendered(page)).toBe(true);
  expect(requests).toEqual([forwarderUrls[0]]);
  expect(await page.evaluate(() => [...document.scripts].map((script) => script.src)))
    .toEqual([`${pageOrigin}/widget.js`, forwarderUrls[0]]);
  expect(errors).toEqual([]);
});
