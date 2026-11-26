#!/usr/bin/env node

/*
 * Partner embed check.
 *
 * Some partners embed the widget through their own script. Their script builds the <punku-chat>
 * element with attributes that this repository does not control, so a widget change can break
 * their pages although every test here passes. This check loads the partner's real embed on a
 * synthetic page, serves the candidate bundle in place of the CDN file, opens the chat like a
 * visitor (a real mouse click) and sends one message.
 *
 * Every PUNKU API call is answered here, so no agent runs and no server state changes. The chat
 * runs twice: against a server without the visitor-token route (405, like an older backend) and
 * against a server with it.
 *
 * The partner embed comes from the PARTNER_EMBED_HTML environment variable: the partner's script tag
 * and element, as on their page. The release workflow reads it from a repository secret, because the
 * run log of a public repository shows a plain variable. For the same reason, printed errors have
 * their URLs removed.
 *
 * Page errors count only when their stack runs through the widget bundle. Other page errors come
 * from the partner's own code: the check prints them but does not fail on them.
 *
 * Usage:
 *   PARTNER_EMBED_HTML='<script src="..."></script><partner-element ...></partner-element>' \
 *     node scripts/partner-embed-check.cjs --bundle dist/build/static/js/widget.min.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const PAGE_ORIGIN = 'https://partner-check.example';
const ANSWER = 'Partner check answer';
const PUBLIC_KEY_PATTERN = /^pk_[A-Za-z0-9_-]{16,128}$/;
const RENDER_TIMEOUT_MS = 30_000;
const ANSWER_TIMEOUT_MS = 20_000;

/** The run log of a public repository is public: print no URL, because a URL can name the partner. */
const redact = (text) => String(text).replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>()]+/gi, '<url>');
const isWidgetStack = (stack) => /cdn\.punku\.ai\/chat\/|punku-embedded-chat/.test(stack || '');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const bundlePath = argument('bundle') || 'dist/build/static/js/widget.min.js';
const embedHtml = process.env.PARTNER_EMBED_HTML || '';
if (!embedHtml.trim()) {
  console.error('PARTNER_EMBED_HTML is empty. Set it to the partner embed (script tag and element).');
  process.exit(2);
}
let bundle;
try {
  bundle = fs.readFileSync(path.resolve(bundlePath));
} catch (error) {
  console.error(`Cannot read the bundle ${bundlePath}: ${error.message}`);
  process.exit(2);
}

const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Partner embed check</title></head>
<body><h1>Partner embed check</h1>${embedHtml}</body></html>`;

const isPunkuApi = (url) => /(^|\.)punku\.ai$/.test(url.hostname) && url.hostname !== 'cdn.punku.ai' && url.pathname.startsWith('/api/');
const isWidgetBundle = (url) =>
  (url.hostname === 'cdn.punku.ai' && /^\/chat\/[^/]+\/bundle\.min\.js$/.test(url.pathname)) ||
  (url.hostname === 'cdn.jsdelivr.net' && /punku-embedded-chat.*\/dist\/build\/static\/js\/(bundle|widget)\.min\.js$/.test(url.pathname));

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
};

function json(route, status, body) {
  return route.fulfill({ status, headers: { ...corsHeaders, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/** Answer the PUNKU API like a server with (tokenRoute) or without the visitor-token route. */
async function answerApi(route, tokenRoute, seen) {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: corsHeaders });
  }
  if (url.pathname === '/api/v1/widget/sessions') {
    let body = {};
    try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
    const publicKey = body.publishable_key;
    seen.tokenRequests.push({ publicKey: typeof publicKey === 'string' ? publicKey : undefined, apiKey: !!request.headers()['x-api-key'] });
    if (!tokenRoute) return json(route, 405, { detail: 'Method Not Allowed' });
    const valid = typeof publicKey === 'string' ? PUBLIC_KEY_PATTERN.test(publicKey) : !!request.headers()['x-api-key'];
    if (!valid) return json(route, 403, { detail: 'widget_not_available' });
    return json(route, 200, {
      token: 'wt1.partner-check.token',
      session_id: body.session_id || 'partner-check-session',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
    });
  }
  if (url.pathname === '/api/v1/widget/config') {
    seen.lookKeys.push(url.searchParams.get('publishable_key') || '');
    if (!tokenRoute) return json(route, 404, { detail: 'Not Found' });
    return PUBLIC_KEY_PATTERN.test(url.searchParams.get('publishable_key') || '')
      ? json(route, 200, { attributes: {} })
      : json(route, 404, { detail: 'widget_not_available' });
  }
  if (url.pathname.startsWith('/api/v1/run/')) {
    seen.chatCalls += 1;
    const stream = [
      JSON.stringify({ event: 'add_message', data: { sender: 'Machine', text: ANSWER, id: 'partner-check-reply' } }),
      JSON.stringify({ event: 'end', data: { result: { session_id: 'partner-check-session' } } }),
      '',
    ].join('\n');
    return route.fulfill({ status: 200, headers: { ...corsHeaders, 'content-type': 'application/x-ndjson' }, body: stream });
  }
  if (url.pathname === '/api/v1/widget/client-errors') {
    seen.clientErrors += 1;
    return json(route, 202, { status: 'queued' });
  }
  return json(route, 404, { detail: 'Not Found' });
}

async function runOnce(browser, tokenRoute) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const seen = { bundleServed: 0, tokenRequests: [], lookKeys: [], chatCalls: 0, clientErrors: 0, widgetErrors: [], otherErrors: [] };
  page.on('pageerror', (error) => {
    (isWidgetStack(error.stack) ? seen.widgetErrors : seen.otherErrors).push(redact(error.message).slice(0, 200));
  });
  await page.addInitScript(() => {
    window.__punkuRoots = [];
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function attachShadow(options) {
      const root = attach.call(this, options);
      if (this.tagName === 'PUNKU-CHAT') window.__punkuRoots.push([this, root]);
      return root;
    };
  });
  await page.route((url) => url.origin === PAGE_ORIGIN, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml })
  );
  // Count the serves: a changed loader URL would load the live bundle, and the check would test nothing new.
  await page.route(isWidgetBundle, (route) => {
    seen.bundleServed += 1;
    return route.fulfill({ status: 200, headers: { ...corsHeaders, 'content-type': 'application/javascript; charset=utf-8' }, body: bundle });
  });
  await page.route(isPunkuApi, (route) => answerApi(route, tokenRoute, seen));

  await page.goto(`${PAGE_ORIGIN}/`, { waitUntil: 'domcontentloaded' });

  // The partner script renders our widget: find its trigger and click it like a visitor.
  const triggerCenter = () => page.evaluate(() => {
    const entry = window.__punkuRoots.filter(([host]) => host.isConnected).pop();
    const trigger = entry && entry[1].querySelector('.cl-trigger');
    if (!trigger) return null;
    const box = trigger.getBoundingClientRect();
    return box.width > 0 && box.height > 0 ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  });
  let center = null;
  const renderDeadline = Date.now() + RENDER_TIMEOUT_MS;
  while (!center && Date.now() < renderDeadline) {
    center = await triggerCenter();
    if (!center) await page.waitForTimeout(500);
  }
  const result = { rendered: !!center, opened: false, answered: false, seen };
  if (!center) {
    result.widgetState = await page.evaluate(() => {
      const host = document.querySelector('punku-chat');
      if (!host) return 'missing';
      const style = getComputedStyle(host);
      return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' ? 'hidden' : 'no-trigger';
    });
    await page.close();
    return result;
  }
  await page.mouse.click(center.x, center.y);

  const openDeadline = Date.now() + 10_000;
  while (!result.opened && Date.now() < openDeadline) {
    result.opened = await page.evaluate(() => {
      const entry = window.__punkuRoots.filter(([host]) => host.isConnected).pop();
      const field = entry && entry[1].querySelector('.cl-input-element');
      if (!field) return false;
      field.focus();
      return entry[1].activeElement === field;
    });
    if (!result.opened) await page.waitForTimeout(250);
  }
  if (result.opened) {
    await page.keyboard.type('Partner check message');
    await page.keyboard.press('Enter');
    const answerDeadline = Date.now() + ANSWER_TIMEOUT_MS;
    while (!result.answered && Date.now() < answerDeadline) {
      result.answered = await page.evaluate((answer) => {
        const entry = window.__punkuRoots.filter(([host]) => host.isConnected).pop();
        return !!entry && (entry[1].textContent || '').includes(answer);
      }, ANSWER);
      if (!result.answered) await page.waitForTimeout(250);
    }
  }
  await page.close();
  return result;
}

function printDetail(seen) {
  console.log(`  tested bundle served: ${seen.bundleServed}, token requests: ${seen.tokenRequests.length}, chat calls: ${seen.chatCalls}`);
  if (seen.widgetErrors.length) console.log(`  widget errors: ${seen.widgetErrors.slice(0, 3).join(' | ')}`);
  if (seen.otherErrors.length) console.log(`  partner page errors (not counted): ${seen.otherErrors.slice(0, 3).join(' | ')}`);
}

(async () => {
  const browser = await chromium.launch();
  let failed = false;
  try {
    for (const tokenRoute of [false, true]) {
      const label = tokenRoute ? 'server with the token route' : 'server without the token route';
      const result = await runOnce(browser, tokenRoute);
      if (!result.rendered) {
        const reason = {
          missing: 'the partner page added no widget: the partner page or its services may be down, or the embed changed',
          hidden: 'the partner page added the widget, but the widget hid itself',
          'no-trigger': 'the partner page added the widget, but it shows no chat button',
        }[result.widgetState] || 'the widget did not show';
        console.log(`FAIL [${label}] ${reason}`);
        printDetail(result.seen);
        failed = true;
        continue;
      }
      const wrongPublicKeys = [
        ...result.seen.tokenRequests.map((r) => r.publicKey).filter((key) => key !== undefined && !PUBLIC_KEY_PATTERN.test(key)),
        ...result.seen.lookKeys.filter((key) => key && !PUBLIC_KEY_PATTERN.test(key)),
      ];
      const checks = [
        ['the page loads the tested bundle', result.seen.bundleServed > 0],
        ['the chat opens', result.opened],
        ['the visitor gets the answer', result.answered],
        ['a value without pk_ never goes out as a public key', wrongPublicKeys.length === 0],
        ['no widget error', result.seen.widgetErrors.length === 0],
        ['no client error report', result.seen.clientErrors === 0],
      ];
      for (const [name, ok] of checks) {
        console.log(`${ok ? 'PASS' : 'FAIL'} [${label}] ${name}`);
        if (!ok) failed = true;
      }
      printDetail(result.seen);
    }
  } finally {
    await browser.close();
  }
  if (failed) {
    console.log('The partner embed check failed. Do not publish this bundle.');
    process.exit(1);
  }
  console.log('The partner embed check passed.');
})().catch((error) => {
  console.error(redact(error && error.stack ? error.stack : error));
  process.exit(2);
});
