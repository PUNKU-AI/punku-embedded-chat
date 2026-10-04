import { expect, Page, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const pageOrigin = 'https://customer.example.com';
const backendOrigin = 'https://api.example.com';
const flowId = '00000000-0000-4000-8000-000000000001';
const otherFlowId = '00000000-0000-4000-8000-000000000002';
const manifestUrl = 'https://cdn.punku.ai/chat/header-icon-overrides.json';
const imageUrl = 'https://cdn.example.com/customer-logo.svg';
const explicitImageUrl = 'https://cdn.example.com/explicit-logo.svg';
const selector = createHash('sha256')
  .update(JSON.stringify([backendOrigin, flowId, pageOrigin]))
  .digest('hex');
const greenLogo = readFileSync(path.resolve(__dirname, '../assets/icons/tressbrueder-logo-green.svg'));
const localFiles = new Map([
  ['/fixture.html', { contentType: 'text/html', body: readFileSync(path.resolve(__dirname, 'fixture.html')) }],
  ['/nitro-fixture.js', { contentType: 'text/javascript', body: readFileSync(path.resolve(__dirname, 'nitro-fixture.js')) }],
  ['/bundle.js', { contentType: 'text/javascript', body: readFileSync(path.resolve(__dirname, '../dist/build/static/js/bundle.min.js')) }],
]);
const genericSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';
type Failure = 'HTTP' | 'malformed' | 'image';

async function openFixture(page: Page, options: { flowId?: string; explicitImage?: boolean; failure?: Failure } = {}) {
  const requests = { manifest: 0, replacementImage: 0, explicitImage: 0 };
  // Record closed roots without changing the widget's production shadow mode.
  await page.addInitScript(() => {
    window.__widgetRoots = new WeakMap();
    const attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (settings) {
      const root = attachShadow.call(this, settings);
      window.__widgetRoots.set(this, root);
      return root;
    };
  });
  // Every fixture response comes from this test. No request reaches a customer.
  await page.context().route(/https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    if (url.href === manifestUrl) {
      requests.manifest += 1;
      const entries = [{ selector, header_icon: imageUrl }];
      await route.fulfill({
        status: options.failure === 'HTTP' ? 404 : 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(options.failure === 'malformed' ? { entries } : entries),
      });
      return;
    }
    if (url.href === imageUrl || url.href === explicitImageUrl) {
      if (url.href === imageUrl) requests.replacementImage += 1;
      else requests.explicitImage += 1;
      await route.fulfill({
        status: options.failure === 'image' ? 404 : 200,
        contentType: 'image/svg+xml',
        headers,
        body: options.failure === 'image' ? '' : greenLogo,
      });
      return;
    }
    if (url.href === 'https://cdn.punku.ai/chat/icons/lucide/messagesquaretext.svg') {
      await route.fulfill({ contentType: 'image/svg+xml', headers, body: genericSvg });
      return;
    }
    const file = url.origin === pageOrigin && localFiles.get(url.pathname);
    if (file) {
      await route.fulfill({ ...file, headers });
      return;
    }
    await route.abort('blockedbyclient');
  });
  const params = new URLSearchParams({
    host_url: backendOrigin,
    flow_id: options.flowId || flowId,
    header_icon_name: 'MessageSquareText',
    button_text_color: '#ffffff',
    start_open: 'true',
    show_closed_widget_hint: 'false',
    enable_client_error_reporting: 'false',
  });
  if (options.explicitImage) params.set('header_icon', explicitImageUrl);
  await page.bringToFront();
  await page.goto(`${pageOrigin}/fixture.html?${params}`);
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('punku-chat');
    return !!host && !!window.__widgetRoots.get(host)?.querySelector('.cl-header-logo');
  })).toBe(true);
  expect(await page.evaluate(() => document.querySelector('punku-chat')?.shadowRoot)).toBeNull();
  return requests;
}

async function headerState(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('punku-chat')!;
    const root = window.__widgetRoots.get(host)!;
    const icon = root.querySelector<SVGElement | HTMLImageElement>('.cl-header-logo')!;
    const bounds = icon.getBoundingClientRect();
    const style = getComputedStyle(icon);
    return {
      tag: icon.tagName.toLowerCase(),
      className: icon.getAttribute('class'),
      stroke: icon.getAttribute('stroke'),
      childCount: icon.children.length,
      src: icon instanceof HTMLImageElement ? icon.src : null,
      loaded: icon instanceof HTMLImageElement ? icon.complete && icon.naturalWidth > 0 : false,
      visible: bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
    };
  });
}

async function expectGenericIcon(page: Page) {
  await expect.poll(() => headerState(page)).toMatchObject({
    tag: 'svg', className: 'lucide lucide-messagesquaretext cl-header-logo',
    stroke: '#ffffff', childCount: 1, src: null, visible: true,
  });
}

async function waitForFallbackWindow(page: Page) {
  // A negative assertion must outlast the optional configuration timeout.
  await page.waitForTimeout(1700);
}

test('the exact customer context receives the green logo', async ({ page }, testInfo) => {
  expect(greenLogo.toString()).toContain('fill: #3aaa35;');
  const requests = await openFixture(page);
  await expect.poll(() => headerState(page)).toMatchObject({ tag: 'img', src: imageUrl, loaded: true, visible: true });
  expect(requests.manifest).toBe(1);
  expect(requests.replacementImage).toBeGreaterThan(0);
  const screenshot = path.resolve(__dirname, '../output/playwright/header-icon-overrides', `${testInfo.project.name}.png`);
  mkdirSync(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot });
  await testInfo.attach('scoped-green-logo', { path: screenshot, contentType: 'image/png' });
});

test('another flow keeps its existing icon', async ({ page }) => {
  const requests = await openFixture(page, { flowId: otherFlowId });
  await expect.poll(() => requests.manifest).toBe(1);
  await waitForFallbackWindow(page);
  await expectGenericIcon(page);
  expect(requests.replacementImage).toBe(0);
});

test('an explicit image wins without requesting overrides', async ({ page }) => {
  const requests = await openFixture(page, { explicitImage: true });
  await expect.poll(() => headerState(page)).toMatchObject({ tag: 'img', src: explicitImageUrl, loaded: true, visible: true });
  await waitForFallbackWindow(page);
  expect(requests.manifest).toBe(0);
  expect(requests.replacementImage).toBe(0);
  expect(requests.explicitImage).toBeGreaterThan(0);
});

for (const failure of ['HTTP', 'malformed', 'image'] as const) {
  test(`a ${failure} failure preserves the existing icon`, async ({ page }) => {
    const requests = await openFixture(page, { failure });
    await expect.poll(() => requests.manifest).toBe(1);
    if (failure === 'image') await expect.poll(() => requests.replacementImage).toBeGreaterThan(0);
    await waitForFallbackWindow(page);
    await expectGenericIcon(page);
    expect(requests.replacementImage > 0).toBe(failure === 'image');
  });
}
